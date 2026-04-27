from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0004_org_agent_access_token"),
    ]

    operations = [
        migrations.RenameIndex(
            model_name="aggregatedwindow",
            old_name="core_aggregate_org_anl_idx",
            new_name="core_aggreg_organiz_a9b001_idx",
        ),
        migrations.RenameIndex(
            model_name="aggregatedwindow",
            old_name="core_aggrega_analyze_a93770_idx",
            new_name="core_aggreg_analyze_107eb6_idx",
        ),
        migrations.RenameIndex(
            model_name="aggregatedwindow",
            old_name="core_aggrega_agent_i_fa4b73_idx",
            new_name="core_aggreg_agent_i_03009a_idx",
        ),
        migrations.RenameIndex(
            model_name="event",
            old_name="core_event_org_proc_idx",
            new_name="core_event_organiz_066711_idx",
        ),
        migrations.RenameIndex(
            model_name="event",
            old_name="core_event_process_17de8d_idx",
            new_name="core_event_process_155110_idx",
        ),
        migrations.RenameIndex(
            model_name="event",
            old_name="core_event_event_t_481f35_idx",
            new_name="core_event_event_t_aaef96_idx",
        ),
    ]
