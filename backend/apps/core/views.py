from __future__ import annotations

import hashlib
import mimetypes
import re
from datetime import timedelta
from pathlib import Path

from django.contrib.auth import get_user_model
from django.contrib.auth import authenticate, login, logout
from django.conf import settings
from django.db import IntegrityError, connection, transaction
from django.db.models import Avg, Count
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import AgentTokenAuthentication
from .models import (
    Agent,
    AgentEnrollmentToken,
    Alert,
    AggregatedWindow,
    Event,
    LLMProviderConfig,
    MembershipRole,
    Organization,
    OrganizationMembership,
    SchedulerConfig,
)
from .serializers import (
    AlertSerializer,
    AgentQuickEnrollRequestSerializer,
    AgentEnrollmentRequestSerializer,
    AgentEnrollmentTokenCreateSerializer,
    AgentEnrollmentTokenSerializer,
    AgentBootstrapRequestSerializer,
    AgentSerializer,
    EventIngestSerializer,
    LLMProviderConfigSerializer,
    OrganizationMembershipSerializer,
    OrganizationSerializer,
    SessionRegisterSerializer,
    SchedulerConfigSerializer,
)
from .tenancy import ADMIN_ROLES, get_request_organization, require_org_role

ARTIFACT_FILENAME_RE = re.compile(r"^scropids-agent-(linux|windows|darwin)-(amd64|arm64)\.(zip|deb|dmg|exe)$")


class EventIngestView(APIView):
    authentication_classes = (AgentTokenAuthentication,)
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        serializer = EventIngestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        events = serializer.validated_data["events"]
        agent: Agent = request.user

        accepted_events = [item for item in events if not self._is_scaffold_event(item)]

        event_models = [
            Event(
                organization=agent.organization,
                agent=agent,
                event_type=item["event_type"],
                severity=item.get("severity"),
                raw_json=item["data"],
                source_timestamp=item.get("timestamp", timezone.now()),
            )
            for item in accepted_events
        ]
        if event_models:
            Event.objects.bulk_create(event_models, batch_size=1000)
        agent.touch_last_seen()

        return Response(
            {
                "accepted": len(event_models),
                "dropped": max(len(events) - len(event_models), 0),
            },
            status=status.HTTP_202_ACCEPTED,
        )

    def _is_scaffold_event(self, item: dict) -> bool:
        event_type = str(item.get("event_type", "")).strip().lower()
        data = item.get("data") or {}
        if not isinstance(data, dict):
            return False

        if event_type == "process_creation":
            return (
                str(data.get("process_name", "")).lower() == "powershell.exe"
                and "powershell -enc" in str(data.get("command_line", "")).lower()
                and str(data.get("parent_process", "")).lower() == "explorer.exe"
            )
        if event_type == "failed_login":
            return str(data.get("username", "")).lower() == "administrator" and str(data.get("source_ip", "")) == "198.51.100.24"
        if event_type == "network_connection":
            return str(data.get("destination_ip", "")) == "8.8.8.8" and int(data.get("destination_port", 0) or 0) == 53
        if event_type == "system_log":
            return str(data.get("source", "")).lower() == "agent-runtime" and str(data.get("message", "")).strip() == "Service status check completed."
        if event_type == "file_modification":
            return str(data.get("path", "")) == "/etc/sudoers" and str(data.get("operation", "")).lower() == "modified"
        return False


class HealthCheckView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def get(self, request):
        db_ok = True
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        except Exception:  # noqa: BLE001
            db_ok = False
        return Response(
            {
                "status": "ok" if db_ok else "degraded",
                "database": "ok" if db_ok else "error",
                "timestamp": timezone.now().isoformat(),
            },
            status=status.HTTP_200_OK if db_ok else status.HTTP_503_SERVICE_UNAVAILABLE,
        )


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfTokenView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def get(self, request):
        return Response({"detail": "CSRF cookie set."})


class SessionLoginView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request):
        username = request.data.get("username", "").strip()
        password = request.data.get("password", "")
        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response({"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)
        login(request, user)
        return Response({"detail": "Authenticated.", "username": user.get_username()})


class SessionRegisterView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request):
        serializer = SessionRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        User = get_user_model()
        with transaction.atomic():
            user = User.objects.create_user(
                username=payload["username"],
                password=payload["password"],
            )
            organization = Organization.objects.create(
                name=payload["organization_name"],
                created_by=user,
            )
            OrganizationMembership.objects.create(
                organization=organization,
                user=user,
                role=MembershipRole.OWNER,
            )

        login(request, user)
        return Response(
            {
                "detail": "Account created.",
                "username": user.get_username(),
                "organization": {
                    "id": str(organization.id),
                    "name": organization.name,
                    "slug": organization.slug,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class SessionLogoutView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        logout(request)
        return Response({"detail": "Logged out."})


class SessionMeView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        memberships = (
            OrganizationMembership.objects.filter(user=request.user)
            .select_related("organization")
            .order_by("organization__name")
        )
        return Response(
            {
                "id": request.user.id,
                "username": request.user.get_username(),
                "is_staff": request.user.is_staff,
                "organizations": [
                    {
                        "id": str(membership.organization.id),
                        "name": membership.organization.name,
                        "slug": membership.organization.slug,
                        "role": membership.role,
                    }
                    for membership in memberships
                ],
            }
        )


class AgentHeartbeatView(APIView):
    authentication_classes = (AgentTokenAuthentication,)
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        agent: Agent = request.user
        agent.touch_last_seen()
        return Response({"status": "ok", "agent_id": str(agent.id), "organization_slug": agent.organization.slug})


class AgentRuntimeConfigView(APIView):
    authentication_classes = (AgentTokenAuthentication,)
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        agent: Agent = request.user
        config = (
            SchedulerConfig.objects.filter(organization=agent.organization, is_active=True)
            .order_by("name")
            .first()
            or SchedulerConfig.objects.filter(organization=agent.organization).order_by("name").first()
        )
        if config is None:
            return Response({"detail": "No scheduler profile configured."}, status=status.HTTP_404_NOT_FOUND)

        return Response(
            {
                "organization_slug": agent.organization.slug,
                "agent_id": str(agent.id),
                "scheduler": {
                    "name": config.name,
                    "is_active": config.is_active,
                    "agent_sync_interval": config.agent_sync_interval,
                    "agent_event_interval": config.agent_event_interval,
                    "collectors": {
                        "system_logs": config.collect_system_logs,
                        "security_logs": config.collect_security_logs,
                        "network_activity": config.collect_network_activity,
                        "process_activity": config.collect_process_activity,
                        "file_changes": config.collect_file_changes,
                    },
                    "permissions": {
                        "require_elevated_permissions": config.require_elevated_permissions,
                    },
                    "notes": config.agent_profile_notes,
                    "updated_at": config.updated_at.isoformat(),
                },
            }
        )


class AgentAccessTokenView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        organization = get_request_organization(request)
        require_org_role(request, organization, ADMIN_ROLES)
        raw_token = organization.get_agent_access_token()
        if not raw_token:
            raw_token = organization.rotate_agent_access_token()
        masked = "********" if raw_token else ""
        return Response(
            {
                "organization_slug": organization.slug,
                "masked_access_token": masked,
                "access_token": raw_token,
                "rotated_at": organization.agent_access_token_rotated_at.isoformat()
                if organization.agent_access_token_rotated_at
                else None,
            }
        )

    def post(self, request):
        organization = get_request_organization(request)
        require_org_role(request, organization, ADMIN_ROLES)
        raw = organization.rotate_agent_access_token()
        return Response(
            {
                "organization_slug": organization.slug,
                "access_token": raw,
                "rotated_at": organization.agent_access_token_rotated_at.isoformat()
                if organization.agent_access_token_rotated_at
                else None,
            },
            status=status.HTTP_201_CREATED,
        )


class AgentQuickEnrollView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request):
        serializer = AgentQuickEnrollRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        organization = get_object_or_404(Organization, slug=payload["organization_slug"])
        if not organization.check_agent_access_token(payload["access_token"]):
            return Response({"detail": "Invalid organization access token."}, status=status.HTTP_403_FORBIDDEN)

        agent = Agent.objects.filter(organization=organization, hostname=payload["hostname"]).first()
        if agent is None:
            agent = Agent(
                organization=organization,
                hostname=payload["hostname"],
                operating_system=payload["operating_system"],
                ip_address=payload.get("ip_address"),
            )
        else:
            agent.operating_system = payload["operating_system"]
            agent.ip_address = payload.get("ip_address")

        agent_token = Agent.generate_token()
        agent.set_token(agent_token)
        agent.save()

        return Response(
            {
                "agent_id": str(agent.id),
                "agent_token": agent_token,
                "organization_slug": organization.slug,
            },
            status=status.HTTP_201_CREATED,
        )


class AgentBootstrapView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        organization = get_request_organization(request)
        require_org_role(request, organization, ADMIN_ROLES)

        serializer = AgentBootstrapRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        if Agent.objects.filter(organization=organization, hostname=payload["hostname"]).exists():
            return Response(
                {"detail": "An agent with this hostname already exists in the organization."},
                status=status.HTTP_409_CONFLICT,
            )

        agent_token = Agent.generate_token()
        agent = Agent(
            organization=organization,
            hostname=payload["hostname"],
            operating_system=payload["operating_system"],
            ip_address=payload.get("ip_address"),
        )
        agent.set_token(agent_token)
        agent.save()

        return Response(
            {
                "agent_id": str(agent.id),
                "agent_token": agent_token,
                "organization_slug": organization.slug,
                "hostname": agent.hostname,
                "operating_system": agent.operating_system,
                "ip_address": agent.ip_address,
                "created_at": agent.created_at.isoformat(),
            },
            status=status.HTTP_201_CREATED,
        )


class AgentEnrollmentView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request):
        serializer = AgentEnrollmentRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        organization = get_object_or_404(Organization, slug=payload["organization_slug"])
        if Agent.objects.filter(organization=organization, hostname=payload["hostname"]).exists():
            return Response(
                {"detail": "An agent with this hostname already exists in the organization."},
                status=status.HTTP_409_CONFLICT,
            )

        token_record = self._resolve_token(organization, payload["enrollment_token"])
        if token_record is None:
            return Response({"detail": "Invalid or expired enrollment token."}, status=status.HTTP_403_FORBIDDEN)

        agent_token = Agent.generate_token()
        agent = Agent(
            organization=organization,
            hostname=payload["hostname"],
            operating_system=payload["operating_system"],
            ip_address=payload.get("ip_address"),
        )
        agent.set_token(agent_token)
        agent.save()
        token_record.mark_used()

        return Response(
            {
                "agent_id": str(agent.id),
                "agent_token": agent_token,
                "organization_slug": organization.slug,
            },
            status=status.HTTP_201_CREATED,
        )

    def _resolve_token(self, organization: Organization, raw_token: str) -> AgentEnrollmentToken | None:
        now = timezone.now()
        for token in AgentEnrollmentToken.objects.filter(
            organization=organization,
            used_at__isnull=True,
            expires_at__gt=now,
        ):
            if token.check_token(raw_token):
                return token
        return None


class DashboardOverviewView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        organization = get_request_organization(request)
        now = timezone.now()
        last_24h = now - timedelta(hours=24)
        last_7d = now - timedelta(days=7)

        threat_distribution = (
            Alert.objects.filter(organization=organization, created_at__gte=last_7d)
            .values("threat_level")
            .annotate(count=Count("id"))
            .order_by("threat_level")
        )

        confidence_heatmap = (
            Alert.objects.filter(organization=organization, created_at__gte=last_24h)
            .values("agent__hostname")
            .annotate(avg_confidence=Avg("confidence"), count=Count("id"))
            .order_by("-avg_confidence")[:10]
        )

        return Response(
            {
                "organization": {"id": str(organization.id), "name": organization.name, "slug": organization.slug},
                "totals": {
                    "agents": Agent.objects.filter(organization=organization).count(),
                    "events_24h": Event.objects.filter(organization=organization, created_at__gte=last_24h).count(),
                    "active_alerts": Alert.objects.filter(organization=organization).exclude(status="resolved").count(),
                    "aggregates_pending_llm": AggregatedWindow.objects.filter(organization=organization, analyzed=False).count(),
                },
                "threat_distribution": list(threat_distribution),
                "confidence_heatmap": list(confidence_heatmap),
                "generated_at": now.isoformat(),
            }
        )


class AgentDownloadManifestView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        get_request_organization(request)
        artifacts_dir = Path(settings.AGENT_ARTIFACTS_DIR)
        artifacts: list[dict] = []
        if artifacts_dir.exists():
            for file_path in sorted(artifacts_dir.iterdir()):
                if not file_path.is_file():
                    continue
                match = ARTIFACT_FILENAME_RE.match(file_path.name)
                if match is None:
                    continue
                platform_name, architecture, package_type = match.groups()
                artifacts.append(
                    {
                        "filename": file_path.name,
                        "platform": platform_name,
                        "architecture": architecture,
                        "package_type": package_type,
                        "size_bytes": file_path.stat().st_size,
                        "sha256": self._sha256(file_path),
                        "download_path": f"/api/v1/agent-downloads/{file_path.name}/",
                    }
                )
        return Response({"artifacts": artifacts})

    def _sha256(self, path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()


class AgentDownloadFileView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, filename: str):
        get_request_organization(request)
        if ARTIFACT_FILENAME_RE.match(filename) is None:
            return Response({"detail": "Invalid artifact filename."}, status=status.HTTP_400_BAD_REQUEST)

        artifacts_dir = Path(settings.AGENT_ARTIFACTS_DIR)
        file_path = (artifacts_dir / filename).resolve()
        try:
            file_path.relative_to(artifacts_dir.resolve())
        except ValueError:
            return Response({"detail": "Invalid artifact path."}, status=status.HTTP_400_BAD_REQUEST)

        if not file_path.exists() or not file_path.is_file():
            return Response({"detail": "Artifact not found."}, status=status.HTTP_404_NOT_FOUND)

        mime_type, _ = mimetypes.guess_type(file_path.name)
        return FileResponse(
            file_path.open("rb"),
            as_attachment=True,
            filename=file_path.name,
            content_type=mime_type or "application/octet-stream",
        )


class SchedulerConfigViewSet(mixins.ListModelMixin, mixins.UpdateModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = SchedulerConfigSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        organization = get_request_organization(self.request)
        return SchedulerConfig.objects.filter(organization=organization).order_by("name")

    def perform_update(self, serializer):
        organization = get_request_organization(self.request)
        require_org_role(self.request, organization, ADMIN_ROLES)
        serializer.save()


class LLMProviderConfigViewSet(viewsets.ModelViewSet):
    serializer_class = LLMProviderConfigSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        organization = get_request_organization(self.request)
        return LLMProviderConfig.objects.filter(organization=organization).order_by("name")

    def _ensure_single_active(self, instance: LLMProviderConfig) -> None:
        if instance.is_active:
            LLMProviderConfig.objects.exclude(pk=instance.pk).filter(
                organization=instance.organization,
                is_active=True,
            ).update(is_active=False)

    def perform_create(self, serializer):
        organization = get_request_organization(self.request)
        require_org_role(self.request, organization, ADMIN_ROLES)
        try:
            instance = serializer.save(organization=organization)
        except IntegrityError as exc:
            if "unique_llm_provider_name_per_org" in str(exc):
                raise ValidationError({"name": ["Provider name already exists for this tenant."]}) from exc
            raise
        self._ensure_single_active(instance)

    def perform_update(self, serializer):
        organization = get_request_organization(self.request)
        require_org_role(self.request, organization, ADMIN_ROLES)
        try:
            instance = serializer.save()
        except IntegrityError as exc:
            if "unique_llm_provider_name_per_org" in str(exc):
                raise ValidationError({"name": ["Provider name already exists for this tenant."]}) from exc
            raise
        self._ensure_single_active(instance)

    def perform_destroy(self, instance):
        organization = get_request_organization(self.request)
        require_org_role(self.request, organization, ADMIN_ROLES)
        super().perform_destroy(instance)


class AlertViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    serializer_class = AlertSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        organization = get_request_organization(self.request)
        return Alert.objects.select_related("agent", "assigned_to").filter(organization=organization)


class AgentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = AgentSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        organization = get_request_organization(self.request)
        return Agent.objects.filter(organization=organization).order_by("hostname")


class AgentTimelineView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, agent_id: str):
        organization = get_request_organization(request)
        agent = get_object_or_404(Agent, pk=agent_id, organization=organization)

        events = (
            Event.objects.filter(organization=organization, agent=agent)
            .order_by("-source_timestamp", "-created_at")[:200]
        )
        insights = (
            AggregatedWindow.objects.filter(organization=organization, agent=agent, analyzed=True)
            .order_by("-window_end", "-created_at")[:30]
        )

        return Response(
            {
                "agent": {
                    "id": str(agent.id),
                    "hostname": agent.hostname,
                    "operating_system": agent.operating_system,
                    "last_seen": agent.last_seen.isoformat() if agent.last_seen else None,
                },
                "events": [
                    {
                        "id": event.id,
                        "timestamp": event.source_timestamp.isoformat(),
                        "ingested_at": event.created_at.isoformat(),
                        "event_type": event.event_type,
                        "severity": event.severity,
                        "data": event.raw_json,
                    }
                    for event in events
                ],
                "llm_insights": [
                    {
                        "aggregate_id": insight.id,
                        "window_start": insight.window_start.isoformat(),
                        "window_end": insight.window_end.isoformat(),
                        "created_at": insight.created_at.isoformat(),
                        "threat_level": (insight.llm_output or {}).get("threat_level"),
                        "confidence": (insight.llm_output or {}).get("confidence"),
                        "reasoning": (insight.llm_output or {}).get("reasoning"),
                        "recommended_action": (insight.llm_output or {}).get("recommended_action"),
                    }
                    for insight in insights
                ],
            }
        )


class OrganizationViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = OrganizationSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        return Organization.objects.filter(memberships__user=self.request.user).distinct().order_by("name")

    def perform_create(self, serializer):
        organization = serializer.save(created_by=self.request.user)
        OrganizationMembership.objects.create(
            organization=organization,
            user=self.request.user,
            role=MembershipRole.OWNER,
        )


class OrganizationMembershipViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = OrganizationMembershipSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        return OrganizationMembership.objects.select_related("organization").filter(user=self.request.user).order_by(
            "organization__name"
        )


class AgentEnrollmentTokenViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = AgentEnrollmentTokenSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        organization = get_request_organization(self.request)
        return AgentEnrollmentToken.objects.filter(organization=organization).order_by("-created_at")

    def create(self, request, *args, **kwargs):
        organization = get_request_organization(request)
        require_org_role(request, organization, ADMIN_ROLES)

        input_serializer = AgentEnrollmentTokenCreateSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        data = input_serializer.validated_data

        raw_token = AgentEnrollmentToken.generate_token()
        expires_at = timezone.now() + timedelta(hours=data["expires_in_hours"])
        token_record = AgentEnrollmentToken(
            organization=organization,
            description=data.get("description", ""),
            expires_at=expires_at,
            created_by=request.user,
        )
        token_record.set_token(raw_token)
        token_record.save()

        output_serializer = self.get_serializer(token_record)
        payload = dict(output_serializer.data)
        payload["enrollment_token"] = raw_token
        return Response(payload, status=status.HTTP_201_CREATED)
