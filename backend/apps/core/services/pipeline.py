from __future__ import annotations

import ipaddress
import logging
import copy
from collections import Counter, defaultdict
from datetime import timedelta
from typing import Iterable

from django.db import transaction
from django.utils import timezone

from apps.core.models import (
    AggregatedWindow,
    Event,
    LLMMode,
    Organization,
    SchedulerConfig,
    Severity,
)
from apps.core.services.alerts import create_alert_if_needed
from apps.core.services.llm import analyze_aggregate

logger = logging.getLogger(__name__)

SEVERITY_RANK = {
    Severity.LOW: 1,
    Severity.MEDIUM: 2,
    Severity.HIGH: 3,
    Severity.CRITICAL: 4,
}
THREAT_RANK = {
    "low": 1,
    "medium": 2,
    "high": 3,
    "critical": 4,
}

DEFAULT_RULE_ENGINE_CONFIG = {
    "built_in_rules": {
        "multi_signal_attack_combo": {
            "enabled": True,
            "failed_logins_gte": 5,
            "suspicious_commands_gte": 1,
            "external_connections_gte": 1,
            "set_threat": "high",
            "min_confidence": 85,
        },
        "severe_correlated_activity": {
            "enabled": True,
            "failed_logins_gte": 8,
            "suspicious_commands_gte": 2,
            "external_connections_gte": 2,
            "set_threat": "critical",
            "min_confidence": 92,
        },
        "process_obfuscation_burst": {
            "enabled": True,
            "suspicious_commands_gte": 2,
            "new_processes_gte": 5,
            "set_threat": "high",
            "min_confidence": 85,
        },
        "external_connection_spike": {
            "enabled": True,
            "external_connections_gte": 3,
            "set_threat": "high",
            "min_confidence": 85,
        },
    },
    "custom_rules": [],
}

SUSPICIOUS_MARKERS = ("-enc", "base64", "invoke-expression", "iex", "downloadstring")


def run_scheduler_tick() -> dict:
    now = timezone.now()
    configs = SchedulerConfig.objects.select_related("organization").filter(is_active=True)
    if not configs.exists():
        return {"status": "inactive", "reason": "no_active_scheduler_configs"}

    results: list[dict] = []
    for config in configs:
        if config.last_aggregation_run:
            elapsed = (now - config.last_aggregation_run).total_seconds()
            if elapsed < config.aggregation_interval:
                continue

        window_start = config.last_aggregation_run or (now - timedelta(seconds=config.aggregation_interval))
        window_end = now
        aggregate_ids = aggregate_events(config.organization, window_start, window_end, config.min_severity)
        config.last_aggregation_run = now
        config.save(update_fields=["last_aggregation_run", "updated_at"])

        analyzed_count = 0
        if config.llm_mode in {LLMMode.REALTIME, LLMMode.BATCH}:
            analyzed_count = analyze_pending_aggregates(config, aggregate_ids)

        results.append(
            {
                "organization_slug": config.organization.slug,
                "window_start": window_start.isoformat(),
                "window_end": window_end.isoformat(),
                "aggregates_created": len(aggregate_ids),
                "aggregates_analyzed": analyzed_count,
            }
        )

    return {
        "status": "ok",
        "organizations_processed": len(results),
        "results": results,
    }


def aggregate_events(organization: Organization, window_start, window_end, min_severity: str) -> list[int]:
    events_qs = (
        Event.objects.select_related("agent", "organization")
        .filter(
            organization=organization,
            processed=False,
            created_at__gt=window_start,
            created_at__lte=window_end,
        )
        .order_by("agent_id", "created_at")
    )
    filtered_events = [event for event in events_qs if _severity_meets_threshold(event.severity, min_severity)]
    if not filtered_events:
        return []

    grouped: dict[str, list[Event]] = defaultdict(list)
    for event in filtered_events:
        grouped[str(event.agent_id)].append(event)

    aggregate_ids: list[int] = []
    processed_event_ids: list[int] = []

    with transaction.atomic():
        for events in grouped.values():
            payload = _build_aggregate_payload(events, window_start, window_end)
            aggregate = AggregatedWindow.objects.create(
                organization=organization,
                agent=events[0].agent,
                window_start=window_start,
                window_end=window_end,
                source_event_count=len(events),
                summary_json=payload,
            )
            aggregate_ids.append(aggregate.id)
            processed_event_ids.extend([event.id for event in events])

        Event.objects.filter(id__in=processed_event_ids).update(processed=True)

    return aggregate_ids


def analyze_pending_aggregates(config: SchedulerConfig, aggregate_ids: Iterable[int] | None = None) -> int:
    aggregates = AggregatedWindow.objects.filter(
        organization=config.organization,
        analyzed=False,
    )
    if aggregate_ids:
        aggregates = aggregates.filter(id__in=list(aggregate_ids))

    analyzed_count = 0
    for aggregate in aggregates.select_related("agent"):
        try:
            llm_output = analyze_aggregate(aggregate.summary_json, organization=config.organization)
        except Exception as exc:  # noqa: BLE001
            logger.exception("LLM analysis failed for aggregate=%s: %s", aggregate.id, exc)
            aggregate.llm_output = {
                "error": str(exc),
                "threat_level": "low",
                "confidence": 0,
                "reasoning": "LLM analysis failed",
                "recommended_action": "Inspect aggregate manually",
            }
            aggregate.llm_output = _apply_rule_escalation(aggregate.llm_output, aggregate.summary_json, config)
            aggregate.analyzed = True
            aggregate.save(update_fields=["llm_output", "analyzed"])
            analyzed_count += 1
            continue

        llm_output = _apply_rule_escalation(llm_output, aggregate.summary_json, config)
        aggregate.llm_output = llm_output
        aggregate.analyzed = True
        aggregate.save(update_fields=["llm_output", "analyzed"])
        create_alert_if_needed(aggregate, llm_output, config.alert_threshold)
        analyzed_count += 1

    return analyzed_count


def _severity_meets_threshold(event_severity: str, min_severity: str) -> bool:
    return SEVERITY_RANK.get(event_severity, 0) >= SEVERITY_RANK.get(min_severity, 0)


def _build_aggregate_payload(events: list[Event], window_start, window_end) -> dict:
    failed_logins = 0
    new_processes = 0
    suspicious_commands = 0
    external_connections = 0
    suspicious_process_counter = Counter()
    event_type_counter = Counter()

    for event in events:
        event_type_counter[event.event_type] += 1
        raw = event.raw_json or {}
        if event.event_type in {"failed_login", "authentication_failure"}:
            failed_logins += 1

        if event.event_type in {"process_creation", "process_start"}:
            new_processes += 1
            process_name = str(raw.get("process_name", "unknown"))
            command_line = str(raw.get("command_line", "")).lower()
            if any(marker in command_line for marker in SUSPICIOUS_MARKERS):
                suspicious_commands += 1
                suspicious_process_counter[process_name] += 1

        if event.event_type in {"network_connection", "network_outbound"}:
            destination_ip = raw.get("destination_ip")
            if destination_ip and _is_external_ip(destination_ip):
                external_connections += 1

    top_suspicious = [
        {"process": process, "count": count}
        for process, count in suspicious_process_counter.most_common(5)
    ]

    return {
        "organization_id": str(events[0].organization_id),
        "organization_slug": events[0].organization.slug if events[0].organization_id else "",
        "agent_id": str(events[0].agent_id),
        "agent_hostname": events[0].agent.hostname,
        "window_start": window_start.isoformat(),
        "window_end": window_end.isoformat(),
        "summary": {
            "event_count": len(events),
            "failed_logins": failed_logins,
            "new_processes": new_processes,
            "suspicious_commands": suspicious_commands,
            "external_connections": external_connections,
        },
        "top_event_types": [
            {"event_type": event_type, "count": count}
            for event_type, count in event_type_counter.most_common(5)
        ],
        "top_suspicious": top_suspicious,
    }


def _is_external_ip(ip_value: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_value)
    except ValueError:
        return False
    return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast)


def _apply_rule_escalation(llm_output: dict, summary_payload: dict, config: SchedulerConfig | None = None) -> dict:
    if config is not None and not config.rule_engine_enabled:
        llm_output["rule_matches"] = []
        llm_output["rule_escalated"] = False
        return llm_output

    summary = (summary_payload or {}).get("summary", {}) if isinstance(summary_payload, dict) else {}
    failed_logins = int(summary.get("failed_logins", 0) or 0)
    suspicious_commands = int(summary.get("suspicious_commands", 0) or 0)
    external_connections = int(summary.get("external_connections", 0) or 0)
    new_processes = int(summary.get("new_processes", 0) or 0)
    event_count = int(summary.get("event_count", 0) or 0)

    current_level = str(llm_output.get("threat_level", "low")).lower().strip()
    if current_level not in THREAT_RANK:
        current_level = "low"
    target_level = current_level
    triggered_rules: list[str] = []
    min_confidence_target = 0

    merged = _merged_rule_engine_config(config)
    built_in = merged.get("built_in_rules", {})
    for rule_name, rule in built_in.items():
        if not _rule_conditions_match(rule, failed_logins, suspicious_commands, external_connections, new_processes, event_count):
            continue
        set_threat = str(rule.get("set_threat", "low")).lower().strip()
        if set_threat not in THREAT_RANK:
            continue
        target_level = _max_threat(target_level, set_threat)
        min_confidence_target = max(min_confidence_target, _as_int(rule.get("min_confidence"), 0))
        triggered_rules.append(rule_name)

    for idx, custom_rule in enumerate(merged.get("custom_rules", [])):
        if not isinstance(custom_rule, dict):
            continue
        if not _rule_conditions_match(
            custom_rule,
            failed_logins,
            suspicious_commands,
            external_connections,
            new_processes,
            event_count,
        ):
            continue
        set_threat = str(custom_rule.get("set_threat", "low")).lower().strip()
        if set_threat not in THREAT_RANK:
            continue
        rule_id = str(custom_rule.get("id", f"custom_rule_{idx+1}")).strip() or f"custom_rule_{idx+1}"
        target_level = _max_threat(target_level, set_threat)
        min_confidence_target = max(min_confidence_target, _as_int(custom_rule.get("min_confidence"), 0))
        triggered_rules.append(rule_id)

    escalated = THREAT_RANK[target_level] > THREAT_RANK[current_level]
    llm_output["rule_matches"] = triggered_rules
    llm_output["rule_escalated"] = escalated

    if not escalated:
        return llm_output

    llm_output["threat_level"] = target_level
    current_conf = int(llm_output.get("confidence", 0) or 0)
    min_confidence = min_confidence_target or (85 if target_level == "high" else 92)
    llm_output["confidence"] = max(current_conf, min_confidence)

    base_reasoning = str(llm_output.get("reasoning", "")).strip()
    llm_output["reasoning"] = (
        f"Rule escalation ({', '.join(triggered_rules)}) raised severity to {target_level}. {base_reasoning}"
    ).strip()

    base_action = str(llm_output.get("recommended_action", "")).strip()
    llm_output["recommended_action"] = (
        "Prioritize containment, investigate credential abuse and outbound C2 indicators. "
        + base_action
    ).strip()
    return llm_output


def _max_threat(a: str, b: str) -> str:
    return a if THREAT_RANK.get(a, 0) >= THREAT_RANK.get(b, 0) else b


def _as_int(value, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _as_bool(value, fallback: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes", "on"}:
            return True
        if lowered in {"false", "0", "no", "off"}:
            return False
    return fallback


def _merged_rule_engine_config(config: SchedulerConfig | None) -> dict:
    merged = copy.deepcopy(DEFAULT_RULE_ENGINE_CONFIG)
    if config is None or not isinstance(config.rule_config_json, dict):
        return merged

    raw = config.rule_config_json
    raw_built_in = raw.get("built_in_rules", {})
    if isinstance(raw_built_in, dict):
        for rule_name, overrides in raw_built_in.items():
            if not isinstance(overrides, dict):
                continue
            base = merged["built_in_rules"].setdefault(rule_name, {})
            base.update(overrides)

    raw_custom = raw.get("custom_rules", [])
    if isinstance(raw_custom, list):
        merged["custom_rules"] = raw_custom
    return merged


def _rule_conditions_match(
    rule: dict,
    failed_logins: int,
    suspicious_commands: int,
    external_connections: int,
    new_processes: int,
    event_count: int,
) -> bool:
    if not _as_bool(rule.get("enabled", True), True):
        return False
    if failed_logins < _as_int(rule.get("failed_logins_gte"), 0):
        return False
    if suspicious_commands < _as_int(rule.get("suspicious_commands_gte"), 0):
        return False
    if external_connections < _as_int(rule.get("external_connections_gte"), 0):
        return False
    if new_processes < _as_int(rule.get("new_processes_gte"), 0):
        return False
    if event_count < _as_int(rule.get("event_count_gte"), 0):
        return False
    return True
