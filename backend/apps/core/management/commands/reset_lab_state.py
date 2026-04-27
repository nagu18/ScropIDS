from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import MembershipRole, Organization, OrganizationMembership


class Command(BaseCommand):
    help = "Remove seeded tenant data and rebuild a single clean workspace while preserving admin and normal users."

    def add_arguments(self, parser):
        parser.add_argument("--admin-username", default="admin", help="Admin username to preserve")
        parser.add_argument("--normal-username", default="normal", help="Normal username to preserve")
        parser.add_argument("--admin-password", default="admin", help="Password to set for the admin user")
        parser.add_argument("--normal-password", default="normal", help="Password to set for the normal user")
        parser.add_argument("--workspace-name", default="ScropIDS Workspace", help="Fresh workspace name")
        parser.add_argument(
            "--normal-role",
            default=MembershipRole.ANALYST,
            choices=MembershipRole.values,
            help="Role to assign to the normal user in the fresh workspace",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        User = get_user_model()
        admin_username = options["admin_username"]
        normal_username = options["normal_username"]
        admin_password = options["admin_password"]
        normal_password = options["normal_password"]
        workspace_name = options["workspace_name"]
        normal_role = options["normal_role"]

        try:
            admin_user = User.objects.get(username=admin_username)
        except User.DoesNotExist as exc:
            raise CommandError(f"Admin user '{admin_username}' does not exist.") from exc

        try:
            normal_user = User.objects.get(username=normal_username)
        except User.DoesNotExist as exc:
            raise CommandError(f"Normal user '{normal_username}' does not exist.") from exc

        Organization.objects.all().delete()

        admin_user.is_staff = True
        admin_user.is_superuser = True
        admin_user.set_password(admin_password)
        admin_user.save(update_fields=["is_staff", "is_superuser", "password"])

        normal_user.is_staff = False
        normal_user.is_superuser = False
        normal_user.set_password(normal_password)
        normal_user.save(update_fields=["is_staff", "is_superuser", "password"])

        workspace = Organization.objects.create(name=workspace_name, created_by=admin_user)
        OrganizationMembership.objects.create(
            organization=workspace,
            user=admin_user,
            role=MembershipRole.OWNER,
        )
        OrganizationMembership.objects.create(
            organization=workspace,
            user=normal_user,
            role=normal_role,
        )

        self.stdout.write(self.style.SUCCESS("Lab state reset complete."))
        self.stdout.write(f"Workspace: {workspace.name}")
        self.stdout.write(f"Workspace slug: {workspace.slug}")
        self.stdout.write(f"Admin user: {admin_user.username} / {admin_password}")
        self.stdout.write(f"Normal user: {normal_user.username} / {normal_password}")
        self.stdout.write(f"Normal role: {normal_role}")
