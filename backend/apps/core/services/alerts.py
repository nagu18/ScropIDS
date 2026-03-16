from __future__ import annotations

from apps.core.models import Alert, AggregatedWindow
from apps.core.services.notifiers import notify_alert

THREAT_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}


def should_emit_alert(threat_level: str, threshold: str) -> bool:
    return THREAT_RANK.get(threat_level, 0) >= THREAT_RANK.get(threshold, 99)


def create_alert_if_needed(
    aggregate: AggregatedWindow,
    llm_output: dict,
    threshold: str,
) -> Alert | None:
    threat_level = llm_output.get("threat_level", "low")
    if not should_emit_alert(threat_level, threshold):
        return None

    alert = Alert.objects.create(
        organization=aggregate.organization,
        aggregate=aggregate,
        agent=aggregate.agent,
        threat_level=threat_level,
        confidence=int(llm_output.get("confidence", 0)),
        llm_analysis=llm_output,
    )
    notify_alert(alert)
    return alert
