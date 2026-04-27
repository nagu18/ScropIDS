from __future__ import annotations

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.core.models import Organization, SchedulerConfig


@receiver(post_save, sender=Organization)
def create_default_scheduler_config(sender, instance: Organization, created: bool, **kwargs):
    if not created:
        return
    SchedulerConfig.objects.get_or_create(
        organization=instance,
        name="default",
    )
    if not instance.agent_access_token_encrypted:
        instance.rotate_agent_access_token()
