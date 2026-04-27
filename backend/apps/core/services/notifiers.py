from __future__ import annotations

import logging

import requests
from django.conf import settings
from django.core.mail import send_mail

from apps.core.models import Alert

logger = logging.getLogger(__name__)


def notify_alert(alert: Alert) -> None:
    _send_email(alert)
    _send_slack(alert)
    _send_telegram(alert)


def _message(alert: Alert) -> str:
    agent = alert.agent.hostname if alert.agent else "unknown-agent"
    reasoning = str(alert.llm_analysis.get("reasoning", "No reasoning"))
    action = str(alert.llm_analysis.get("recommended_action", "Investigate manually"))
    return (
        f"ScropIDS Alert #{alert.id}\n"
        f"Agent: {agent}\n"
        f"Threat: {alert.threat_level}\n"
        f"Confidence: {alert.confidence}%\n"
        f"Reasoning: {reasoning}\n"
        f"Action: {action}"
    )


def _send_email(alert: Alert) -> None:
    if not settings.ALERT_EMAIL_TO:
        return
    try:
        send_mail(
            subject=f"[ScropIDS] {alert.threat_level.upper()} alert on {alert.agent.hostname if alert.agent else 'unknown'}",
            message=_message(alert),
            from_email=settings.ALERT_EMAIL_FROM,
            recipient_list=settings.ALERT_EMAIL_TO,
            fail_silently=False,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Alert email send failed for alert=%s: %s", alert.id, exc)


def _send_slack(alert: Alert) -> None:
    webhook = settings.SLACK_WEBHOOK_URL
    if not webhook:
        return
    try:
        requests.post(
            webhook,
            json={"text": _message(alert)},
            timeout=10,
        ).raise_for_status()
    except Exception as exc:  # noqa: BLE001
        logger.exception("Slack notification failed for alert=%s: %s", alert.id, exc)


def _send_telegram(alert: Alert) -> None:
    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_CHAT_ID
    if not token or not chat_id:
        return
    try:
        requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": _message(alert)},
            timeout=10,
        ).raise_for_status()
    except Exception as exc:  # noqa: BLE001
        logger.exception("Telegram notification failed for alert=%s: %s", alert.id, exc)
