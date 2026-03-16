import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "scropids.settings")

app = Celery("scropids")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    "scheduler-tick-every-minute": {
        "task": "apps.core.tasks.scheduler_tick",
        "schedule": crontab(minute="*"),
    }
}
