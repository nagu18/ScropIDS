from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers

from .models import (
    Agent,
    Alert,
    AggregatedWindow,
    AgentEnrollmentToken,
    Event,
    LLMProviderConfig,
    Organization,
    OrganizationMembership,
    SchedulerConfig,
    Severity,
)


class EventRecordSerializer(serializers.Serializer):
    timestamp = serializers.DateTimeField(required=False)
    event_type = serializers.CharField(max_length=128)
    severity = serializers.ChoiceField(choices=Severity.choices, default=Severity.LOW)
    data = serializers.DictField()

    def validate_timestamp(self, value):
        return value or timezone.now()


class EventIngestSerializer(serializers.Serializer):
    events = EventRecordSerializer(many=True)


class SessionRegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, min_length=3)
    password = serializers.CharField(max_length=128, min_length=8, write_only=True)
    organization_name = serializers.CharField(max_length=120, min_length=2)

    def validate_username(self, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise serializers.ValidationError("Username is required.")
        User = get_user_model()
        if User.objects.filter(username__iexact=normalized).exists():
            raise serializers.ValidationError("Username already exists.")
        return normalized

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value


class AgentSerializer(serializers.ModelSerializer):
    organization_slug = serializers.CharField(source="organization.slug", read_only=True)

    class Meta:
        model = Agent
        fields = ("id", "organization_slug", "hostname", "operating_system", "ip_address", "last_seen", "created_at")
        read_only_fields = fields


class SchedulerConfigSerializer(serializers.ModelSerializer):
    organization_slug = serializers.CharField(source="organization.slug", read_only=True)

    class Meta:
        model = SchedulerConfig
        fields = (
            "id",
            "organization_slug",
            "name",
            "is_active",
            "aggregation_interval",
            "llm_mode",
            "min_severity",
            "alert_threshold",
            "agent_sync_interval",
            "agent_event_interval",
            "collect_system_logs",
            "collect_security_logs",
            "collect_network_activity",
            "collect_process_activity",
            "collect_file_changes",
            "require_elevated_permissions",
            "rule_engine_enabled",
            "rule_pack_source_url",
            "rule_config_json",
            "agent_profile_notes",
            "last_aggregation_run",
            "updated_at",
        )
        read_only_fields = ("last_aggregation_run", "updated_at")


class LLMProviderConfigSerializer(serializers.ModelSerializer):
    api_key = serializers.CharField(write_only=True, required=False, allow_blank=True)
    masked_api_key = serializers.SerializerMethodField()
    organization_slug = serializers.CharField(source="organization.slug", read_only=True)

    class Meta:
        model = LLMProviderConfig
        fields = (
            "id",
            "organization_slug",
            "name",
            "provider_type",
            "base_url",
            "model",
            "timeout_seconds",
            "is_active",
            "api_key",
            "masked_api_key",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def create(self, validated_data):
        api_key = validated_data.pop("api_key", "")
        instance = super().create(validated_data)
        if api_key:
            instance.set_api_key(api_key)
            instance.save(update_fields=["encrypted_api_key", "updated_at"])
        return instance

    def update(self, instance, validated_data):
        api_key = validated_data.pop("api_key", None)
        instance = super().update(instance, validated_data)
        if api_key is not None:
            if api_key:
                instance.set_api_key(api_key)
            else:
                instance.encrypted_api_key = ""
            instance.save(update_fields=["encrypted_api_key", "updated_at"])
        return instance

    def get_masked_api_key(self, obj: LLMProviderConfig) -> str:
        if not obj.encrypted_api_key:
            return ""
        return "********"


class AggregatedWindowSerializer(serializers.ModelSerializer):
    agent = AgentSerializer(read_only=True)

    class Meta:
        model = AggregatedWindow
        fields = (
            "id",
            "agent",
            "window_start",
            "window_end",
            "source_event_count",
            "summary_json",
            "analyzed",
            "llm_output",
            "created_at",
        )
        read_only_fields = fields


class AlertSerializer(serializers.ModelSerializer):
    agent = AgentSerializer(read_only=True)

    class Meta:
        model = Alert
        fields = (
            "id",
            "agent",
            "threat_level",
            "confidence",
            "status",
            "assigned_to",
            "llm_analysis",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("threat_level", "confidence", "llm_analysis", "created_at", "updated_at")


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ("id", "name", "slug", "created_at")
        read_only_fields = ("id", "slug", "created_at")


class OrganizationMembershipSerializer(serializers.ModelSerializer):
    organization = OrganizationSerializer(read_only=True)

    class Meta:
        model = OrganizationMembership
        fields = ("id", "organization", "role", "created_at")
        read_only_fields = fields


class AgentEnrollmentTokenCreateSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=255, required=False, allow_blank=True)
    expires_in_hours = serializers.IntegerField(min_value=1, max_value=168, default=24)


class AgentEnrollmentTokenSerializer(serializers.ModelSerializer):
    organization_slug = serializers.CharField(source="organization.slug", read_only=True)

    class Meta:
        model = AgentEnrollmentToken
        fields = ("id", "organization_slug", "description", "expires_at", "used_at", "created_at")
        read_only_fields = fields


class AgentEnrollmentRequestSerializer(serializers.Serializer):
    organization_slug = serializers.SlugField(max_length=140)
    enrollment_token = serializers.CharField(max_length=256)
    hostname = serializers.CharField(max_length=255)
    operating_system = serializers.CharField(max_length=64)
    ip_address = serializers.IPAddressField(required=False, allow_null=True)


class AgentBootstrapRequestSerializer(serializers.Serializer):
    hostname = serializers.CharField(max_length=255)
    operating_system = serializers.CharField(max_length=64)
    ip_address = serializers.IPAddressField(required=False, allow_null=True)


class AgentQuickEnrollRequestSerializer(serializers.Serializer):
    organization_slug = serializers.SlugField(max_length=140)
    access_token = serializers.CharField(max_length=256)
    hostname = serializers.CharField(max_length=255)
    operating_system = serializers.CharField(max_length=64)
    ip_address = serializers.IPAddressField(required=False, allow_null=True)
