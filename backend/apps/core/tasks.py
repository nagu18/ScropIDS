from __future__ import annotations

import logging

from celery import shared_task

from apps.core.services.pipeline import run_scheduler_tick

logger = logging.getLogger(__name__)


@shared_task(name="apps.core.tasks.scheduler_tick")
def scheduler_tick() -> dict:
    result = run_scheduler_tick()
    logger.info("Scheduler tick result: %s", result)
    return result
