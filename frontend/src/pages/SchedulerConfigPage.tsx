import { CalendarClock, Save, ServerCog } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import type { SchedulerConfig } from "@/types/api";

export function SchedulerConfigPage() {
  const [config, setConfig] = useState<SchedulerConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const response = await api.get<SchedulerConfig[]>("/scheduler-configs/");
      setConfig(response.data[0] ?? null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!config) return;
    setSaving(true);
    try {
      const response = await api.patch<SchedulerConfig>(`/scheduler-configs/${config.id}/`, {
        is_active: config.is_active,
        aggregation_interval: config.aggregation_interval,
        llm_mode: config.llm_mode,
        min_severity: config.min_severity,
        alert_threshold: config.alert_threshold,
        agent_sync_interval: config.agent_sync_interval,
        agent_event_interval: config.agent_event_interval,
        collect_system_logs: config.collect_system_logs,
        collect_security_logs: config.collect_security_logs,
        collect_network_activity: config.collect_network_activity,
        collect_process_activity: config.collect_process_activity,
        collect_file_changes: config.collect_file_changes,
        require_elevated_permissions: config.require_elevated_permissions,
        agent_profile_notes: config.agent_profile_notes,
      });
      setConfig(response.data);
      toast.success("Scheduler profile updated for server and agents.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="h-64 animate-pulse rounded-xl bg-slate-700/20" />;
  }

  if (!config) {
    return <div className="text-sm text-muted">No scheduler profile found for tenant.</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scheduler Management"
        subtitle="Single profile controls both backend aggregation and agent runtime behavior."
      />
      <form className="grid gap-4 xl:grid-cols-2" onSubmit={save}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-accent" />
              Server Scheduler
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="flex items-center justify-between rounded-md border border-border px-3 py-3">
              <span className="text-sm">Scheduler Enabled</span>
              <Switch
                checked={config.is_active}
                onCheckedChange={(value) => setConfig((prev) => (prev ? { ...prev, is_active: value } : prev))}
              />
            </label>

            <div className="grid gap-2">
              <p className="text-xs uppercase tracking-wide text-muted">Aggregation Interval (seconds)</p>
              <Input
                type="number"
                min={5}
                value={config.aggregation_interval}
                onChange={(event) =>
                  setConfig((prev) => (prev ? { ...prev, aggregation_interval: Number(event.target.value) } : prev))
                }
              />
            </div>

            <div className="grid gap-2">
              <p className="text-xs uppercase tracking-wide text-muted">LLM Mode</p>
              <Select
                value={config.llm_mode}
                onValueChange={(value) =>
                  setConfig((prev) => (prev ? { ...prev, llm_mode: value as "batch" | "realtime" } : prev))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="batch">Batch</SelectItem>
                  <SelectItem value="realtime">Realtime</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div className="grid gap-2">
                <p className="text-xs uppercase tracking-wide text-muted">Minimum Severity</p>
                <Select
                  value={config.min_severity}
                  onValueChange={(value) =>
                    setConfig((prev) => (prev ? { ...prev, min_severity: value as SchedulerConfig["min_severity"] } : prev))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <p className="text-xs uppercase tracking-wide text-muted">Alert Threshold</p>
                <Select
                  value={config.alert_threshold}
                  onValueChange={(value) =>
                    setConfig((prev) => (prev ? { ...prev, alert_threshold: value as SchedulerConfig["alert_threshold"] } : prev))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ServerCog className="h-4 w-4 text-accent" />
              Agent Scheduler Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2 md:grid-cols-2">
              <div className="grid gap-2">
                <p className="text-xs uppercase tracking-wide text-muted">Agent Sync Interval (seconds)</p>
                <Input
                  type="number"
                  min={15}
                  value={config.agent_sync_interval}
                  onChange={(event) =>
                    setConfig((prev) => (prev ? { ...prev, agent_sync_interval: Number(event.target.value) } : prev))
                  }
                />
              </div>
              <div className="grid gap-2">
                <p className="text-xs uppercase tracking-wide text-muted">Agent Event Interval (seconds)</p>
                <Input
                  type="number"
                  min={5}
                  value={config.agent_event_interval}
                  onChange={(event) =>
                    setConfig((prev) => (prev ? { ...prev, agent_event_interval: Number(event.target.value) } : prev))
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <p className="text-xs uppercase tracking-wide text-muted">Enabled Collectors</p>
              <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                System logs
                <Switch
                  checked={config.collect_system_logs}
                  onCheckedChange={(value) =>
                    setConfig((prev) => (prev ? { ...prev, collect_system_logs: value } : prev))
                  }
                />
              </label>
              <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                Security logs
                <Switch
                  checked={config.collect_security_logs}
                  onCheckedChange={(value) =>
                    setConfig((prev) => (prev ? { ...prev, collect_security_logs: value } : prev))
                  }
                />
              </label>
              <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                Network activity
                <Switch
                  checked={config.collect_network_activity}
                  onCheckedChange={(value) =>
                    setConfig((prev) => (prev ? { ...prev, collect_network_activity: value } : prev))
                  }
                />
              </label>
              <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                Process activity
                <Switch
                  checked={config.collect_process_activity}
                  onCheckedChange={(value) =>
                    setConfig((prev) => (prev ? { ...prev, collect_process_activity: value } : prev))
                  }
                />
              </label>
              <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                File changes
                <Switch
                  checked={config.collect_file_changes}
                  onCheckedChange={(value) =>
                    setConfig((prev) => (prev ? { ...prev, collect_file_changes: value } : prev))
                  }
                />
              </label>
            </div>

            <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              Require elevated permissions
              <Switch
                checked={config.require_elevated_permissions}
                onCheckedChange={(value) =>
                  setConfig((prev) => (prev ? { ...prev, require_elevated_permissions: value } : prev))
                }
              />
            </label>

            <div className="grid gap-2">
              <p className="text-xs uppercase tracking-wide text-muted">Agent Profile Notes</p>
              <Textarea
                rows={4}
                value={config.agent_profile_notes}
                onChange={(event) =>
                  setConfig((prev) => (prev ? { ...prev, agent_profile_notes: event.target.value } : prev))
                }
                placeholder="Example: Finance endpoints must keep security+process logs enabled at all times."
              />
            </div>
          </CardContent>
        </Card>

        <div className="xl:col-span-2">
          <Button type="submit" disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save Scheduler Management Profile"}
          </Button>
        </div>
      </form>
    </div>
  );
}
