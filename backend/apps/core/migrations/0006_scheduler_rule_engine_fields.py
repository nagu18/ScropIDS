from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0005_rename_core_aggregate_org_anl_idx_core_aggreg_organiz_a9b001_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="schedulerconfig",
            name="rule_config_json",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="schedulerconfig",
            name="rule_engine_enabled",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="schedulerconfig",
            name="rule_pack_source_url",
            field=models.URLField(blank=True, default="", max_length=512),
        ),
    ]
