from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import requests

from apps.core.models import LLMProviderConfig, LLMProviderType, Organization, ThreatLevel


LLM_SYSTEM_PROMPT = """You are a cybersecurity threat analysis engine.
Return only strict JSON with this schema:
{
  "threat_level": "low | medium | high | critical",
  "confidence": 0-100,
  "reasoning": "short explanation",
  "recommended_action": "action steps"
}"""


@dataclass
class LLMAnalysis:
    threat_level: str
    confidence: int
    reasoning: str
    recommended_action: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "threat_level": self.threat_level,
            "confidence": self.confidence,
            "reasoning": self.reasoning,
            "recommended_action": self.recommended_action,
        }


def get_active_provider(organization: Organization) -> LLMProviderConfig | None:
    return LLMProviderConfig.objects.filter(organization=organization, is_active=True).first()


def analyze_aggregate(
    aggregate_payload: dict[str, Any],
    organization: Organization,
    provider: LLMProviderConfig | None = None,
) -> dict[str, Any]:
    provider = provider or get_active_provider(organization)
    if provider is None:
        raise RuntimeError("No active LLM provider configured.")

    user_prompt = f"Analyze this aggregated IDS telemetry JSON:\n{json.dumps(aggregate_payload, separators=(',', ':'))}"
    if provider.provider_type == LLMProviderType.OLLAMA:
        raw_content = _call_ollama(provider, user_prompt)
    elif provider.provider_type == LLMProviderType.OPENAI_COMPATIBLE:
        raw_content = _call_openai_compatible(provider, user_prompt)
    else:
        raise RuntimeError(f"Unsupported provider type: {provider.provider_type}")

    analysis = _validate_analysis(_extract_json(raw_content))
    payload = analysis.as_dict()
    payload["provider"] = provider.name
    payload["model"] = provider.model
    payload["generated_at"] = datetime.now(timezone.utc).isoformat()
    return payload


def _call_openai_compatible(provider: LLMProviderConfig, user_prompt: str) -> str:
    url = f"{provider.base_url.rstrip('/')}/chat/completions"
    headers = {"Content-Type": "application/json"}
    api_key = provider.get_api_key()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": provider.model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": LLM_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    }
    response = requests.post(url, json=payload, headers=headers, timeout=provider.timeout_seconds)
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"]


def _call_ollama(provider: LLMProviderConfig, user_prompt: str) -> str:
    url = f"{provider.base_url.rstrip('/')}/api/chat"
    payload = {
        "model": provider.model,
        "stream": False,
        "format": "json",
        "messages": [
            {"role": "system", "content": LLM_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    }
    response = requests.post(url, json=payload, timeout=provider.timeout_seconds)
    response.raise_for_status()
    data = response.json()
    return data["message"]["content"]


def _extract_json(raw_content: str) -> dict[str, Any]:
    content = raw_content.strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # Fall back to best-effort extraction if model wrapped JSON in prose/code fences.
    match = re.search(r"\{.*\}", content, flags=re.DOTALL)
    if not match:
        raise ValueError("LLM output does not contain JSON.")
    return json.loads(match.group(0))


def _validate_analysis(payload: dict[str, Any]) -> LLMAnalysis:
    required = {"threat_level", "confidence", "reasoning", "recommended_action"}
    missing = required - payload.keys()
    if missing:
        raise ValueError(f"LLM JSON missing keys: {', '.join(sorted(missing))}")

    threat_level = str(payload["threat_level"]).lower().strip()
    if threat_level not in set(ThreatLevel.values):
        raise ValueError(f"Invalid threat_level: {threat_level}")

    try:
        confidence = int(payload["confidence"])
    except (TypeError, ValueError) as exc:
        raise ValueError("confidence must be integer 0-100") from exc

    if confidence < 0 or confidence > 100:
        raise ValueError("confidence must be 0-100")

    reasoning = str(payload["reasoning"]).strip()
    recommended_action = str(payload["recommended_action"]).strip()
    if not reasoning or not recommended_action:
        raise ValueError("reasoning and recommended_action cannot be empty")

    return LLMAnalysis(
        threat_level=threat_level,
        confidence=confidence,
        reasoning=reasoning,
        recommended_action=recommended_action,
    )
