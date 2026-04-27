from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AgentEnrollmentTokenViewSet,
    AgentEnrollmentView,
    AgentDownloadFileView,
    AgentDownloadManifestView,
    AgentQuickEnrollView,
    AgentAccessTokenView,
    AgentBootstrapView,
    AgentHeartbeatView,
    AgentRuntimeConfigView,
    AgentTimelineView,
    AgentViewSet,
    AlertViewSet,
    CsrfTokenView,
    DashboardOverviewView,
    EventIngestView,
    HealthCheckView,
    LLMProviderConfigViewSet,
    OrganizationMembershipViewSet,
    OrganizationViewSet,
    SchedulerConfigViewSet,
    SessionLoginView,
    SessionRegisterView,
    SessionLogoutView,
    SessionMeView,
)

router = DefaultRouter()
router.register("organizations", OrganizationViewSet, basename="organization")
router.register("organization-memberships", OrganizationMembershipViewSet, basename="organization-membership")
router.register("agents", AgentViewSet, basename="agent")
router.register("agent-enrollment-tokens", AgentEnrollmentTokenViewSet, basename="agent-enrollment-token")
router.register("scheduler-configs", SchedulerConfigViewSet, basename="scheduler-config")
router.register("llm-providers", LLMProviderConfigViewSet, basename="llm-provider")
router.register("alerts", AlertViewSet, basename="alert")

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health"),
    path("auth/csrf/", CsrfTokenView.as_view(), name="auth-csrf"),
    path("auth/login/", SessionLoginView.as_view(), name="auth-login"),
    path("auth/register/", SessionRegisterView.as_view(), name="auth-register"),
    path("auth/logout/", SessionLogoutView.as_view(), name="auth-logout"),
    path("auth/me/", SessionMeView.as_view(), name="auth-me"),
    path("agents/enroll/", AgentEnrollmentView.as_view(), name="agents-enroll"),
    path("agents/bootstrap/", AgentBootstrapView.as_view(), name="agents-bootstrap"),
    path("agents/quick-enroll/", AgentQuickEnrollView.as_view(), name="agents-quick-enroll"),
    path("agents/access-token/", AgentAccessTokenView.as_view(), name="agents-access-token"),
    path("agents/<uuid:agent_id>/timeline/", AgentTimelineView.as_view(), name="agent-timeline"),
    path("ingest/config/", AgentRuntimeConfigView.as_view(), name="ingest-config"),
    path("agent-downloads/", AgentDownloadManifestView.as_view(), name="agent-download-manifest"),
    path("agent-downloads/<str:filename>/", AgentDownloadFileView.as_view(), name="agent-download-file"),
    path("ingest/events/", EventIngestView.as_view(), name="ingest-events"),
    path("ingest/heartbeat/", AgentHeartbeatView.as_view(), name="ingest-heartbeat"),
    path("dashboard/overview/", DashboardOverviewView.as_view(), name="dashboard-overview"),
    path("", include(router.urls)),
]
