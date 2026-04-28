from __future__ import annotations

from datetime import timedelta

from django.core.management import call_command
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed

from .models import (
    Alert,
    Agent,
    Event,
    LLMProviderConfig,
    MembershipRole,
    Organization,
    OrganizationMembership,
    SchedulerConfig,
    Severity,
)
from .authentication import AgentTokenAuthentication
from .services.pipeline import aggregate_events, analyze_pending_aggregates


class AgentModelTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(username="owner", password="pass1234")
        self.organization = Organization.objects.create(name="Acme Security", slug="acme-security", created_by=user)
        OrganizationMembership.objects.create(organization=self.organization, user=user, role=MembershipRole.OWNER)

    def test_agent_token_round_trip(self):
        agent = Agent.objects.create(organization=self.organization, hostname="host1", operating_system="linux")
        token = Agent.generate_token()
        agent.set_token(token)
        agent.save()

        self.assertTrue(agent.check_token(token))
        self.assertFalse(agent.check_token("invalid-token"))

    def test_invalid_agent_id_header_returns_auth_failure(self):
        class DummyRequest:
            META = {
                "HTTP_X_AGENT_ID": "not-a-uuid",
                "HTTP_X_AGENT_TOKEN": "bad-token",
            }

        auth = AgentTokenAuthentication()
        with self.assertRaises(AuthenticationFailed):
            auth.authenticate(DummyRequest())


class AggregatePipelineTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(username="owner2", password="pass1234")
        self.organization = Organization.objects.create(name="Blue SOC", slug="blue-soc", created_by=user)
        OrganizationMembership.objects.create(organization=self.organization, user=user, role=MembershipRole.OWNER)
        self.scheduler = SchedulerConfig.objects.get(organization=self.organization, name="default")
        self.scheduler.is_active = True
        self.scheduler.aggregation_interval = 300
        self.scheduler.min_severity = Severity.MEDIUM
        self.scheduler.alert_threshold = "high"
        self.scheduler.save(update_fields=["is_active", "aggregation_interval", "min_severity", "alert_threshold", "updated_at"])

    def test_aggregate_events_creates_window_and_marks_processed(self):
        agent = Agent.objects.create(organization=self.organization, hostname="host1", operating_system="linux")
        now = timezone.now()
        Event.objects.create(
            organization=self.organization,
            agent=agent,
            event_type="process_creation",
            severity=Severity.HIGH,
            source_timestamp=now,
            raw_json={
                "process_name": "powershell.exe",
                "command_line": "powershell -enc YmFk",
            },
        )

        ids = aggregate_events(self.organization, now - timedelta(minutes=5), now + timedelta(seconds=1), Severity.MEDIUM)
        self.assertEqual(len(ids), 1)
        self.assertEqual(Event.objects.filter(processed=True).count(), 1)

    def test_rule_engine_emits_alert_when_llm_provider_missing(self):
        agent = Agent.objects.create(organization=self.organization, hostname="host2", operating_system="linux")
        now = timezone.now()

        for index in range(5):
            Event.objects.create(
                organization=self.organization,
                agent=agent,
                event_type="failed_login",
                severity=Severity.HIGH,
                source_timestamp=now + timedelta(seconds=index),
                raw_json={"username": "administrator", "source_ip": f"198.51.100.{20 + index}"},
            )

        Event.objects.create(
            organization=self.organization,
            agent=agent,
            event_type="process_creation",
            severity=Severity.HIGH,
            source_timestamp=now + timedelta(seconds=10),
            raw_json={
                "process_name": "powershell.exe",
                "command_line": "powershell -enc ZABhAG4AZwBlAHIA",
            },
        )

        Event.objects.create(
            organization=self.organization,
            agent=agent,
            event_type="network_connection",
            severity=Severity.HIGH,
            source_timestamp=now + timedelta(seconds=11),
            raw_json={"destination_ip": "8.8.8.8"},
        )

        ids = aggregate_events(self.organization, now - timedelta(minutes=5), now + timedelta(minutes=1), Severity.MEDIUM)
        self.assertEqual(len(ids), 1)

        analyzed = analyze_pending_aggregates(self.scheduler, ids)
        self.assertEqual(analyzed, 1)
        self.assertEqual(Alert.objects.filter(organization=self.organization, agent=agent).count(), 1)

        alert = Alert.objects.get(organization=self.organization, agent=agent)
        self.assertEqual(alert.threat_level, "high")
        self.assertTrue(alert.llm_analysis.get("rule_escalated"))
        self.assertIn("multi_signal_attack_combo", alert.llm_analysis.get("rule_matches", []))


class BootstrapDemoEnvironmentTests(TestCase):
    def test_bootstrap_command_seeds_demo_workspace_and_provider(self):
        call_command(
            "bootstrap_demo_environment",
            "--force-reset",
            "True",
            "--agent-access-token",
            "stable-demo-agent-token",
            "--llm-api-key",
            "demo-key",
        )

        User = get_user_model()
        admin_user = User.objects.get(username="admin")
        normal_user = User.objects.get(username="normal")
        workspace = Organization.objects.get(slug="scropids-workspace")
        provider = LLMProviderConfig.objects.get(organization=workspace, name="OpenRouter Gemma 4 31B Free")
        scheduler = SchedulerConfig.objects.get(organization=workspace, name="default")

        self.assertTrue(admin_user.is_staff)
        self.assertTrue(admin_user.is_superuser)
        self.assertFalse(normal_user.is_staff)
        self.assertTrue(admin_user.check_password("admin"))
        self.assertTrue(normal_user.check_password("normal"))
        self.assertEqual(Organization.objects.count(), 1)
        self.assertEqual(
            OrganizationMembership.objects.get(user=admin_user, organization=workspace).role,
            MembershipRole.OWNER,
        )
        self.assertEqual(
            OrganizationMembership.objects.get(user=normal_user, organization=workspace).role,
            MembershipRole.ANALYST,
        )
        self.assertEqual(workspace.get_agent_access_token(), "stable-demo-agent-token")
        self.assertTrue(scheduler.is_active)
        self.assertEqual(provider.provider_type, "openai_compatible")
        self.assertEqual(provider.base_url, "https://openrouter.ai/api/v1")
        self.assertEqual(provider.model, "google/gemma-4-31b-it:free")
        self.assertTrue(provider.is_active)
        self.assertEqual(provider.get_api_key(), "demo-key")
