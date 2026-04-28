from __future__ import annotations

import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from apps.core.models import (
    LLMProviderConfig,
    LLMProviderType,
    MembershipRole,
    Organization,
    OrganizationMembership,
    SchedulerConfig,
)


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Command(BaseCommand):
    help = "Seed a ready-to-demo ScropIDS environment for container startup."

    def add_arguments(self, parser):
        parser.add_argument("--enabled", default=os.getenv("SCROPIDS_BOOTSTRAP_ENABLED", "True"))
        parser.add_argument("--force-reset", default=os.getenv("SCROPIDS_BOOTSTRAP_FORCE_RESET", "False"))
        parser.add_argument("--admin-username", default=os.getenv("SCROPIDS_BOOTSTRAP_ADMIN_USERNAME", "admin"))
        parser.add_argument("--admin-password", default=os.getenv("SCROPIDS_BOOTSTRAP_ADMIN_PASSWORD", "admin"))
        parser.add_argument("--normal-username", default=os.getenv("SCROPIDS_BOOTSTRAP_NORMAL_USERNAME", "normal"))
        parser.add_argument("--normal-password", default=os.getenv("SCROPIDS_BOOTSTRAP_NORMAL_PASSWORD", "normal"))
        parser.add_argument("--workspace-name", default=os.getenv("SCROPIDS_BOOTSTRAP_WORKSPACE_NAME", "ScropIDS Workspace"))
        parser.add_argument(
            "--agent-access-token",
            default=os.getenv("SCROPIDS_BOOTSTRAP_AGENT_ACCESS_TOKEN", ""),
        )
        parser.add_argument(
            "--normal-role",
            default=os.getenv("SCROPIDS_BOOTSTRAP_NORMAL_ROLE", MembershipRole.ANALYST),
            choices=MembershipRole.values,
        )
        parser.add_argument(
            "--llm-provider-name",
            default=os.getenv("SCROPIDS_BOOTSTRAP_LLM_PROVIDER_NAME", "OpenRouter Gemma 4 31B Free"),
        )
        parser.add_argument(
            "--llm-provider-type",
            default=os.getenv("SCROPIDS_BOOTSTRAP_LLM_PROVIDER_TYPE", LLMProviderType.OPENAI_COMPATIBLE),
            choices=LLMProviderType.values,
        )
        parser.add_argument(
            "--llm-base-url",
            default=os.getenv("SCROPIDS_BOOTSTRAP_LLM_BASE_URL", "https://openrouter.ai/api/v1"),
        )
        parser.add_argument(
            "--llm-model",
            default=os.getenv("SCROPIDS_BOOTSTRAP_LLM_MODEL", "google/gemma-4-31b-it:free"),
        )
        parser.add_argument(
            "--llm-timeout-seconds",
            type=int,
            default=int(os.getenv("SCROPIDS_BOOTSTRAP_LLM_TIMEOUT_SECONDS", "60")),
        )
        parser.add_argument(
            "--llm-api-key",
            default=os.getenv("SCROPIDS_BOOTSTRAP_LLM_API_KEY", ""),
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if not _as_bool(options["enabled"], default=True):
            self.stdout.write("Demo bootstrap disabled.")
            return

        force_reset = _as_bool(options["force_reset"], default=False)
        admin_username = options["admin_username"].strip()
        normal_username = options["normal_username"].strip()
        admin_password = options["admin_password"]
        normal_password = options["normal_password"]
        workspace_name = options["workspace_name"].strip() or "ScropIDS Workspace"
        workspace_slug = slugify(workspace_name) or "scropids-workspace"
        agent_access_token = options["agent_access_token"].strip()
        normal_role = options["normal_role"]
        llm_provider_name = options["llm_provider_name"].strip()
        llm_provider_type = options["llm_provider_type"]
        llm_base_url = options["llm_base_url"].strip()
        llm_model = options["llm_model"].strip()
        llm_timeout_seconds = options["llm_timeout_seconds"]
        llm_api_key = options["llm_api_key"].strip()

        User = get_user_model()

        if force_reset:
            Organization.objects.all().delete()
        else:
            legacy_org = Organization.objects.filter(slug="legacy-default", created_by__isnull=True).first()
            if legacy_org is not None:
                is_placeholder = not any(
                    (
                        legacy_org.memberships.exists(),
                        legacy_org.agents.exists(),
                        legacy_org.events.exists(),
                        legacy_org.alerts.exists(),
                        legacy_org.aggregates.exists(),
                        legacy_org.llm_provider_configs.exists(),
                        legacy_org.scheduler_configs.exists(),
                        legacy_org.enrollment_tokens.exists(),
                    )
                )
                if is_placeholder:
                    legacy_org.delete()

        admin_user, _ = User.objects.get_or_create(username=admin_username)
        admin_user.is_staff = True
        admin_user.is_superuser = True
        admin_user.set_password(admin_password)
        admin_user.save()

        normal_user, _ = User.objects.get_or_create(username=normal_username)
        normal_user.is_staff = False
        normal_user.is_superuser = False
        normal_user.set_password(normal_password)
        normal_user.save()

        workspace = Organization.objects.filter(slug=workspace_slug).first()
        if workspace is None:
            workspace = Organization.objects.filter(name=workspace_name).first()
        if workspace is None:
            workspace = Organization.objects.create(name=workspace_name, created_by=admin_user)
        elif workspace.name != workspace_name:
            workspace.name = workspace_name
            workspace.save(update_fields=["name", "updated_at"])

        OrganizationMembership.objects.update_or_create(
            organization=workspace,
            user=admin_user,
            defaults={"role": MembershipRole.OWNER},
        )
        OrganizationMembership.objects.update_or_create(
            organization=workspace,
            user=normal_user,
            defaults={"role": normal_role},
        )

        SchedulerConfig.objects.get_or_create(
            organization=workspace,
            name="default",
            defaults={
                "is_active": True,
                "aggregation_interval": 300,
                "llm_mode": "batch",
                "min_severity": "medium",
                "alert_threshold": "high",
                "agent_sync_interval": 60,
                "agent_event_interval": 15,
                "collect_system_logs": True,
                "collect_security_logs": True,
                "collect_network_activity": True,
                "collect_process_activity": True,
                "collect_file_changes": False,
                "require_elevated_permissions": False,
                "rule_engine_enabled": True,
                "rule_pack_source_url": "",
                "rule_config_json": {},
                "agent_profile_notes": "",
            },
        )

        if agent_access_token:
            if workspace.get_agent_access_token() != agent_access_token:
                workspace.set_agent_access_token(agent_access_token)
                workspace.save(update_fields=["agent_access_token_encrypted", "agent_access_token_rotated_at", "updated_at"])
        elif not workspace.agent_access_token_encrypted:
            workspace.rotate_agent_access_token()

        if llm_provider_name and llm_base_url and llm_model:
            provider, created = LLMProviderConfig.objects.get_or_create(
                organization=workspace,
                name=llm_provider_name,
                defaults={
                    "provider_type": llm_provider_type,
                    "base_url": llm_base_url,
                    "model": llm_model,
                    "timeout_seconds": llm_timeout_seconds,
                    "is_active": bool(llm_api_key),
                },
            )
            if created:
                if llm_api_key:
                    provider.set_api_key(llm_api_key)
                    provider.save(update_fields=["encrypted_api_key", "updated_at"])
            else:
                updated_fields: list[str] = []
                if force_reset:
                    provider.provider_type = llm_provider_type
                    provider.base_url = llm_base_url
                    provider.model = llm_model
                    provider.timeout_seconds = llm_timeout_seconds
                    updated_fields.extend(["provider_type", "base_url", "model", "timeout_seconds"])
                if llm_api_key and not provider.encrypted_api_key:
                    provider.set_api_key(llm_api_key)
                    provider.is_active = True
                    updated_fields.extend(["encrypted_api_key", "is_active"])
                if updated_fields:
                    provider.save(update_fields=[*updated_fields, "updated_at"])

        self.stdout.write(self.style.SUCCESS("Demo bootstrap complete."))
        self.stdout.write(f"Workspace: {workspace.name} ({workspace.slug})")
        self.stdout.write(f"Admin user: {admin_username}")
        self.stdout.write(f"Normal user: {normal_username} [{normal_role}]")
        self.stdout.write(f"Agent token ready: {'yes' if workspace.agent_access_token_encrypted else 'no'}")
        if workspace.agent_access_token_encrypted:
            agent_token = workspace.get_agent_access_token()
            self.stdout.write(f"Agent access token: {agent_token}")
            self.stdout.write("")
            self.stdout.write("Docker Agent Setup:")
            self.stdout.write(f"  export SCROPIDS_AGENT_API_BASE=http://backend:8000/api/v1")
            self.stdout.write(f"  export SCROPIDS_AGENT_ORG_SLUG={workspace.slug}")
            self.stdout.write(f"  export SCROPIDS_AGENT_ORG_ACCESS_TOKEN={agent_token}")
            self.stdout.write(f"  docker-compose up agent")
