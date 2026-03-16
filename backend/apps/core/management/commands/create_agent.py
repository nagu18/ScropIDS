from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from apps.core.models import Agent, Organization


class Command(BaseCommand):
    help = "Create a ScropIDS agent and print credentials."

    def add_arguments(self, parser):
        parser.add_argument("--org-slug", required=True, help="Organization slug")
        parser.add_argument("--hostname", required=True, help="Agent hostname")
        parser.add_argument("--os", required=True, help="Operating system")
        parser.add_argument("--ip", required=False, help="Agent IP address")

    def handle(self, *args, **options):
        org_slug = options["org_slug"]
        hostname = options["hostname"]
        operating_system = options["os"]
        ip_address = options.get("ip")

        try:
            organization = Organization.objects.get(slug=org_slug)
        except Organization.DoesNotExist as exc:
            raise CommandError(f"Organization slug '{org_slug}' does not exist.") from exc

        if Agent.objects.filter(organization=organization, hostname=hostname).exists():
            raise CommandError(f"Agent with hostname '{hostname}' already exists in organization '{org_slug}'.")

        token = Agent.generate_token()
        agent = Agent(
            organization=organization,
            hostname=hostname,
            operating_system=operating_system,
            ip_address=ip_address,
        )
        agent.set_token(token)
        agent.save()

        self.stdout.write(self.style.SUCCESS("Agent created successfully"))
        self.stdout.write(f"Organization: {organization.slug}")
        self.stdout.write(f"Agent ID: {agent.id}")
        self.stdout.write(f"Agent Token: {token}")
