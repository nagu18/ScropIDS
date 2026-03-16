from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from .models import Agent, Event, MembershipRole, Organization, OrganizationMembership, Severity
from .services.pipeline import aggregate_events


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


class AggregatePipelineTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(username="owner2", password="pass1234")
        self.organization = Organization.objects.create(name="Blue SOC", slug="blue-soc", created_by=user)
        OrganizationMembership.objects.create(organization=self.organization, user=user, role=MembershipRole.OWNER)

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
