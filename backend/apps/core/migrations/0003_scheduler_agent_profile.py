from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0002_multi_tenant_saas"),
    ]

    operations = [
        migrations.AddField(
            model_name="schedulerconfig",
            name="agent_event_interval",
            field=models.PositiveIntegerField(default=15),
        ),
        migrations.AddField(
            model_name="schedulerconfig",
            name="agent_profile_notes",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="schedulerconfig",
            name="agent_sync_interval",
            field=models.PositiveIntegerField(default=60),
        ),
        migrations.AddField(
            model_name="schedulerconfig",
            name="collect_file_changes",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="schedulerconfig",
            name="collect_network_activity",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="schedulerconfig",
            name="collect_process_activity",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="schedulerconfig",
            name="collect_security_logs",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="schedulerconfig",
            name="collect_system_logs",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="schedulerconfig",
            name="require_elevated_permissions",
            field=models.BooleanField(default=False),
        ),
    ]
