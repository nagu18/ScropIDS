from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import timedelta
from hmac import compare_digest

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

from .services.encryption import decrypt_text, encrypt_text


class Severity(models.TextChoices):
    LOW = "low", "Low"
    MEDIUM = "medium", "Medium"
    HIGH = "high", "High"
    CRITICAL = "critical", "Critical"


class ThreatLevel(models.TextChoices):
    LOW = "low", "Low"
    MEDIUM = "medium", "Medium"
    HIGH = "high", "High"
    CRITICAL = "critical", "Critical"


class LLMMode(models.TextChoices):
    REALTIME = "realtime", "Realtime"
    BATCH = "batch", "Batch"


class AlertStatus(models.TextChoices):
    OPEN = "open", "Open"
    IN_PROGRESS = "in_progress", "In Progress"
    RESOLVED = "resolved", "Resolved"


class MembershipRole(models.TextChoices):
    OWNER = "owner", "Owner"
    ADMIN = "admin", "Admin"
    ANALYST = "analyst", "Analyst"
    VIEWER = "viewer", "Viewer"


class Organization(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="organizations_created",
    )
    agent_access_token_encrypted = models.TextField(blank=True, default="")
    agent_access_token_rotated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.name) or "org"
            self.slug = _generate_unique_slug(base_slug, self.__class__)
        super().save(*args, **kwargs)

    @staticmethod
    def generate_agent_access_token() -> str:
        return secrets.token_urlsafe(48)

    def set_agent_access_token(self, raw_token: str) -> None:
        self.agent_access_token_encrypted = encrypt_text(raw_token)
        self.agent_access_token_rotated_at = timezone.now()

    def get_agent_access_token(self) -> str:
        if not self.agent_access_token_encrypted:
            return ""
        return decrypt_text(self.agent_access_token_encrypted)

    def check_agent_access_token(self, raw_token: str) -> bool:
        current = self.get_agent_access_token()
        if not current:
            return False
        return compare_digest(current, raw_token)

    def rotate_agent_access_token(self) -> str:
        raw = self.generate_agent_access_token()
        self.set_agent_access_token(raw)
        self.save(update_fields=["agent_access_token_encrypted", "agent_access_token_rotated_at", "updated_at"])
        return raw


class OrganizationMembership(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="organization_memberships")
    role = models.CharField(max_length=16, choices=MembershipRole.choices, default=MembershipRole.ANALYST)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("organization", "user"), name="unique_org_user_membership"),
        ]
        ordering = ("organization__name", "user_id")

    def __str__(self) -> str:
        return f"{self.user} in {self.organization} ({self.role})"


class AgentEnrollmentToken(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="enrollment_tokens")
    token_hash = models.CharField(max_length=64, unique=True)
    description = models.CharField(max_length=255, blank=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_enrollment_tokens",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.organization.slug}:{self.expires_at.isoformat()}"

    @staticmethod
    def generate_token() -> str:
        return secrets.token_urlsafe(48)

    @staticmethod
    def default_expiration(hours: int = 24):
        return timezone.now() + timedelta(hours=hours)

    def set_token(self, raw_token: str) -> None:
        self.token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    def check_token(self, raw_token: str) -> bool:
        digest = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        return compare_digest(digest, self.token_hash)

    @property
    def is_usable(self) -> bool:
        return self.used_at is None and self.expires_at > timezone.now()

    def mark_used(self) -> None:
        self.used_at = timezone.now()
        self.save(update_fields=["used_at"])


class Agent(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="agents")
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hostname = models.CharField(max_length=255)
    operating_system = models.CharField(max_length=64)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    api_token_hash = models.CharField(max_length=64, unique=True, blank=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("hostname",)
        constraints = [
            models.UniqueConstraint(fields=("organization", "hostname"), name="unique_agent_hostname_per_org"),
        ]

    def __str__(self) -> str:
        return f"{self.hostname} ({self.operating_system})"

    @property
    def is_authenticated(self) -> bool:
        return True

    @property
    def is_anonymous(self) -> bool:
        return False

    @staticmethod
    def generate_token() -> str:
        return secrets.token_urlsafe(48)

    def set_token(self, raw_token: str) -> None:
        digest = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        self.api_token_hash = digest

    def check_token(self, raw_token: str) -> bool:
        digest = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        return compare_digest(digest, self.api_token_hash)

    def touch_last_seen(self) -> None:
        self.last_seen = timezone.now()
        self.save(update_fields=["last_seen", "updated_at"])


class Event(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="events")
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=128)
    severity = models.CharField(max_length=16, choices=Severity.choices, default=Severity.LOW)
    raw_json = models.JSONField()
    source_timestamp = models.DateTimeField()
    processed = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=("organization", "processed", "created_at")),
            models.Index(fields=("processed", "created_at")),
            models.Index(fields=("event_type", "severity")),
        ]
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.agent.hostname}::{self.event_type}::{self.severity}"


class SchedulerConfig(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="scheduler_configs")
    name = models.CharField(max_length=64, default="default")
    is_active = models.BooleanField(default=True)
    aggregation_interval = models.PositiveIntegerField(default=300)
    llm_mode = models.CharField(max_length=16, choices=LLMMode.choices, default=LLMMode.BATCH)
    min_severity = models.CharField(max_length=16, choices=Severity.choices, default=Severity.MEDIUM)
    alert_threshold = models.CharField(max_length=16, choices=ThreatLevel.choices, default=ThreatLevel.HIGH)
    agent_sync_interval = models.PositiveIntegerField(default=60)
    agent_event_interval = models.PositiveIntegerField(default=15)
    collect_system_logs = models.BooleanField(default=True)
    collect_security_logs = models.BooleanField(default=True)
    collect_network_activity = models.BooleanField(default=True)
    collect_process_activity = models.BooleanField(default=True)
    collect_file_changes = models.BooleanField(default=False)
    require_elevated_permissions = models.BooleanField(default=False)
    rule_engine_enabled = models.BooleanField(default=True)
    rule_pack_source_url = models.URLField(max_length=512, blank=True, default="")
    rule_config_json = models.JSONField(default=dict, blank=True)
    agent_profile_notes = models.TextField(blank=True, default="")
    last_aggregation_run = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Scheduler Config"
        verbose_name_plural = "Scheduler Config"
        constraints = [
            models.UniqueConstraint(fields=("organization", "name"), name="unique_scheduler_config_name_per_org"),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.aggregation_interval}s)"


class LLMProviderType(models.TextChoices):
    OPENAI_COMPATIBLE = "openai_compatible", "OpenAI Compatible"
    OLLAMA = "ollama", "Ollama"


class LLMProviderConfig(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="llm_provider_configs")
    name = models.CharField(max_length=120)
    provider_type = models.CharField(max_length=32, choices=LLMProviderType.choices)
    base_url = models.URLField(max_length=512)
    model = models.CharField(max_length=120)
    encrypted_api_key = models.TextField(blank=True)
    is_active = models.BooleanField(default=False)
    timeout_seconds = models.PositiveIntegerField(default=30)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)
        constraints = [
            models.UniqueConstraint(fields=("organization", "name"), name="unique_llm_provider_name_per_org"),
        ]

    def __str__(self) -> str:
        return f"{self.name} [{self.provider_type}]"

    def set_api_key(self, raw_key: str) -> None:
        self.encrypted_api_key = encrypt_text(raw_key)

    def get_api_key(self) -> str:
        if not self.encrypted_api_key:
            return ""
        return decrypt_text(self.encrypted_api_key)


class AggregatedWindow(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="aggregates")
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="aggregates")
    window_start = models.DateTimeField()
    window_end = models.DateTimeField()
    source_event_count = models.PositiveIntegerField(default=0)
    summary_json = models.JSONField()
    analyzed = models.BooleanField(default=False)
    llm_output = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=("organization", "analyzed", "created_at")),
            models.Index(fields=("analyzed", "created_at")),
            models.Index(fields=("agent", "window_start", "window_end")),
        ]
        ordering = ("-window_end",)

    def __str__(self) -> str:
        return f"{self.agent.hostname} {self.window_start.isoformat()}-{self.window_end.isoformat()}"


class Alert(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="alerts")
    aggregate = models.ForeignKey(AggregatedWindow, on_delete=models.SET_NULL, null=True, blank=True, related_name="alerts")
    agent = models.ForeignKey(Agent, on_delete=models.SET_NULL, null=True, blank=True, related_name="alerts")
    threat_level = models.CharField(max_length=16, choices=ThreatLevel.choices)
    confidence = models.PositiveSmallIntegerField(validators=[MinValueValidator(0), MaxValueValidator(100)])
    llm_analysis = models.JSONField()
    status = models.CharField(max_length=16, choices=AlertStatus.choices, default=AlertStatus.OPEN)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_alerts",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.threat_level} ({self.confidence}%) [{self.status}]"


def _generate_unique_slug(base_slug: str, model_class) -> str:
    slug = base_slug
    counter = 1
    while model_class.objects.filter(slug=slug).exists():
        counter += 1
        slug = f"{base_slug}-{counter}"
    return slug
