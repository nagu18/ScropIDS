from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0003_scheduler_agent_profile"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="agent_access_token_encrypted",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="organization",
            name="agent_access_token_rotated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
