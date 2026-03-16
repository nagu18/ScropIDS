from django.contrib import admin

from .models import (
    Agent,
    AgentEnrollmentToken,
    Alert,
    AggregatedWindow,
    Event,
    LLMProviderConfig,
    Organization,
    OrganizationMembership,
    SchedulerConfig,
)

admin.site.site_header = "ScropIDS Admin"
admin.site.site_title = "ScropIDS Admin"
admin.site.index_title = "Admin Management"


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "created_by", "created_at")
    search_fields = ("name", "slug")
    readonly_fields = ("created_at", "updated_at")


@admin.register(OrganizationMembership)
class OrganizationMembershipAdmin(admin.ModelAdmin):
    list_display = ("organization", "user", "role", "created_at")
    list_filter = ("role",)
    search_fields = ("organization__name", "user__id")


@admin.register(Agent)
class AgentAdmin(admin.ModelAdmin):
    list_display = ("hostname", "organization", "operating_system", "ip_address", "last_seen", "created_at")
    list_filter = ("organization", "operating_system")
    search_fields = ("hostname", "organization__name", "operating_system", "ip_address")
    readonly_fields = ("created_at", "updated_at", "last_seen")


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ("id", "organization", "agent", "event_type", "severity", "processed", "created_at")
    list_filter = ("organization", "severity", "processed", "event_type")
    search_fields = ("organization__name", "agent__hostname", "event_type")
    readonly_fields = ("created_at",)


@admin.register(SchedulerConfig)
class SchedulerConfigAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "organization",
        "is_active",
        "aggregation_interval",
        "llm_mode",
        "min_severity",
        "alert_threshold",
        "updated_at",
    )
    list_filter = ("organization", "is_active", "llm_mode")
    readonly_fields = ("updated_at",)


@admin.register(LLMProviderConfig)
class LLMProviderConfigAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "provider_type", "base_url", "model", "is_active", "updated_at")
    list_filter = ("organization", "provider_type", "is_active")
    search_fields = ("organization__name", "name", "model", "base_url")
    readonly_fields = ("created_at", "updated_at")


@admin.register(AggregatedWindow)
class AggregatedWindowAdmin(admin.ModelAdmin):
    list_display = ("id", "organization", "agent", "window_start", "window_end", "source_event_count", "analyzed")
    list_filter = ("organization", "analyzed", "agent")
    readonly_fields = ("created_at",)


@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    list_display = ("id", "organization", "agent", "threat_level", "confidence", "status", "assigned_to", "created_at")
    list_filter = ("organization", "threat_level", "status")
    search_fields = ("organization__name", "agent__hostname")
    readonly_fields = ("created_at", "updated_at")


@admin.register(AgentEnrollmentToken)
class AgentEnrollmentTokenAdmin(admin.ModelAdmin):
    list_display = ("id", "organization", "description", "expires_at", "used_at", "created_by", "created_at")
    list_filter = ("organization", "used_at")
    search_fields = ("organization__name", "description")
