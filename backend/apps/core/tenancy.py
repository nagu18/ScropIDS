from __future__ import annotations

from rest_framework.exceptions import PermissionDenied

from apps.core.models import MembershipRole, Organization, OrganizationMembership


def get_request_organization(request) -> Organization:
    """
    Select tenant from user memberships.
    Optional header: X-Organization-Slug
    """
    user = request.user
    if not user or not getattr(user, "is_authenticated", False):
        raise PermissionDenied("Authentication required.")

    memberships = OrganizationMembership.objects.select_related("organization").filter(user=user).order_by("created_at")
    if not memberships.exists():
        raise PermissionDenied("User has no organization membership.")

    requested_slug = request.META.get("HTTP_X_ORGANIZATION_SLUG", "").strip()
    if requested_slug:
        membership = memberships.filter(organization__slug=requested_slug).first()
        if membership is None:
            raise PermissionDenied("Invalid tenant context.")
        return membership.organization

    return memberships.first().organization


def require_org_role(request, organization: Organization, allowed_roles: set[str]) -> None:
    membership = OrganizationMembership.objects.filter(user=request.user, organization=organization).first()
    if membership is None or membership.role not in allowed_roles:
        raise PermissionDenied("Insufficient tenant permissions.")


ADMIN_ROLES = {MembershipRole.OWNER, MembershipRole.ADMIN}
