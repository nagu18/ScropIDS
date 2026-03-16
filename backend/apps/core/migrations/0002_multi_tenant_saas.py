from __future__ import annotations

import uuid

from django.conf import settings
import django.db.models.deletion
from django.db import migrations, models
from django.utils import timezone


def _ensure_legacy_org(Organization):
    org = Organization.objects.order_by("created_at").first()
    if org is not None:
        return org
    return Organization.objects.create(
        id=uuid.uuid4(),
        name="Legacy Default",
        slug="legacy-default",
        created_at=timezone.now(),
        updated_at=timezone.now(),
    )


def populate_organizations(apps, schema_editor):
    Organization = apps.get_model("core", "Organization")
    OrganizationMembership = apps.get_model("core", "OrganizationMembership")
    Agent = apps.get_model("core", "Agent")
    Event = apps.get_model("core", "Event")
    SchedulerConfig = apps.get_model("core", "SchedulerConfig")
    LLMProviderConfig = apps.get_model("core", "LLMProviderConfig")
    AggregatedWindow = apps.get_model("core", "AggregatedWindow")
    Alert = apps.get_model("core", "Alert")

    app_label, model_name = settings.AUTH_USER_MODEL.split(".")
    User = apps.get_model(app_label, model_name)

    org = _ensure_legacy_org(Organization)

    for agent in Agent.objects.filter(organization__isnull=True).iterator():
        agent.organization_id = org.id
        agent.save(update_fields=["organization"])

    # Normalize duplicate hostnames that become conflicting after legacy rows are assigned to one org.
    hostname_counter = {}
    for agent in Agent.objects.filter(organization=org).order_by("id").iterator():
        base = agent.hostname or "endpoint"
        if base not in hostname_counter:
            hostname_counter[base] = 1
            continue
        hostname_counter[base] += 1
        suffix = hostname_counter[base]
        candidate = f"{base}-{suffix}"
        if len(candidate) > 255:
            candidate = f"{base[:250]}-{suffix}"
        agent.hostname = candidate
        agent.save(update_fields=["hostname"])

    for event in Event.objects.filter(organization__isnull=True).iterator():
        event.organization_id = event.agent.organization_id or org.id
        event.save(update_fields=["organization"])

    SchedulerConfig.objects.filter(organization__isnull=True).update(organization_id=org.id)
    LLMProviderConfig.objects.filter(organization__isnull=True).update(organization_id=org.id)

    for aggregate in AggregatedWindow.objects.filter(organization__isnull=True).iterator():
        aggregate.organization_id = aggregate.agent.organization_id or org.id
        aggregate.save(update_fields=["organization"])

    for alert in Alert.objects.filter(organization__isnull=True).iterator():
        organization_id = org.id
        if alert.agent_id:
            organization_id = alert.agent.organization_id or organization_id
        elif alert.aggregate_id:
            organization_id = alert.aggregate.organization_id or organization_id
        alert.organization_id = organization_id
        alert.save(update_fields=["organization"])

    first_user = User.objects.order_by("id").first()
    if first_user and not OrganizationMembership.objects.filter(organization=org, user=first_user).exists():
        OrganizationMembership.objects.create(
            organization=org,
            user=first_user,
            role="owner",
            created_at=timezone.now(),
        )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Organization",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=120)),
                ("slug", models.SlugField(max_length=140, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="organizations_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ("name",)},
        ),
        migrations.CreateModel(
            name="OrganizationMembership",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "role",
                    models.CharField(
                        choices=[("owner", "Owner"), ("admin", "Admin"), ("analyst", "Analyst"), ("viewer", "Viewer")],
                        default="analyst",
                        max_length=16,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "organization",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="memberships", to="core.organization"),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="organization_memberships",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ("organization__name", "user_id")},
        ),
        migrations.CreateModel(
            name="AgentEnrollmentToken",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("token_hash", models.CharField(max_length=64, unique=True)),
                ("description", models.CharField(blank=True, max_length=255)),
                ("expires_at", models.DateTimeField()),
                ("used_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_enrollment_tokens",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "organization",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="enrollment_tokens", to="core.organization"),
                ),
            ],
            options={"ordering": ("-created_at",)},
        ),
        migrations.AddField(
            model_name="agent",
            name="organization",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="agents", to="core.organization"),
        ),
        migrations.AddField(
            model_name="event",
            name="organization",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="events", to="core.organization"),
        ),
        migrations.AddField(
            model_name="schedulerconfig",
            name="organization",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="scheduler_configs", to="core.organization"),
        ),
        migrations.AddField(
            model_name="llmproviderconfig",
            name="organization",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="llm_provider_configs", to="core.organization"),
        ),
        migrations.AddField(
            model_name="aggregatedwindow",
            name="organization",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="aggregates", to="core.organization"),
        ),
        migrations.AddField(
            model_name="alert",
            name="organization",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="alerts", to="core.organization"),
        ),
        migrations.AlterField(
            model_name="schedulerconfig",
            name="name",
            field=models.CharField(default="default", max_length=64),
        ),
        migrations.AlterField(
            model_name="llmproviderconfig",
            name="name",
            field=models.CharField(max_length=120),
        ),
        migrations.RunPython(populate_organizations, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="agent",
            name="organization",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="agents", to="core.organization"),
        ),
        migrations.AlterField(
            model_name="event",
            name="organization",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="events", to="core.organization"),
        ),
        migrations.AlterField(
            model_name="schedulerconfig",
            name="organization",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="scheduler_configs", to="core.organization"),
        ),
        migrations.AlterField(
            model_name="llmproviderconfig",
            name="organization",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="llm_provider_configs", to="core.organization"),
        ),
        migrations.AlterField(
            model_name="aggregatedwindow",
            name="organization",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="aggregates", to="core.organization"),
        ),
        migrations.AlterField(
            model_name="alert",
            name="organization",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="alerts", to="core.organization"),
        ),
        migrations.AddConstraint(
            model_name="organizationmembership",
            constraint=models.UniqueConstraint(fields=("organization", "user"), name="unique_org_user_membership"),
        ),
        migrations.AddConstraint(
            model_name="agent",
            constraint=models.UniqueConstraint(fields=("organization", "hostname"), name="unique_agent_hostname_per_org"),
        ),
        migrations.AddConstraint(
            model_name="schedulerconfig",
            constraint=models.UniqueConstraint(fields=("organization", "name"), name="unique_scheduler_config_name_per_org"),
        ),
        migrations.AddConstraint(
            model_name="llmproviderconfig",
            constraint=models.UniqueConstraint(fields=("organization", "name"), name="unique_llm_provider_name_per_org"),
        ),
        migrations.AddIndex(
            model_name="event",
            index=models.Index(fields=["organization", "processed", "created_at"], name="core_event_org_proc_idx"),
        ),
        migrations.AddIndex(
            model_name="aggregatedwindow",
            index=models.Index(fields=["organization", "analyzed", "created_at"], name="core_aggregate_org_anl_idx"),
        ),
    ]
