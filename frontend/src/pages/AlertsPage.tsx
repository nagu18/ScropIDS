import { AlertTriangle, ExternalLink, Filter, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import {
  buildMitigationReferences,
  loadAlertSoundConfig,
  pickMostSevereMatchingAlert,
  playAlertSound,
  saveAlertSoundConfig,
  type AlertSoundConfig,
} from "@/lib/alertTools";
import { formatRelative, threatColor } from "@/lib/utils";
import type { Alert } from "@/types/api";

const statusLabel: Record<Alert["status"], string> = {
  open: "Active",
  in_progress: "Investigating",
  resolved: "Closed",
};

export function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Alert | null>(null);
  const [updating, setUpdating] = useState(false);
  const [soundConfig, setSoundConfig] = useState<AlertSoundConfig>(() => loadAlertSoundConfig());

  const loadedRef = useRef(false);
  const knownIdsRef = useRef<Set<number>>(new Set());

  const load = useCallback(
    async (withSound: boolean) => {
      try {
        const response = await api.get<Alert[]>("/alerts/");
        const incoming = response.data;
        if (loadedRef.current && withSound) {
          const newAlerts = incoming.filter((alert) => !knownIdsRef.current.has(alert.id));
          const match = pickMostSevereMatchingAlert(newAlerts, soundConfig);
          if (match) {
            void playAlertSound(match.threat_level, soundConfig.effect, soundConfig.volume);
          }
        }
        setAlerts(incoming);
        knownIdsRef.current = new Set(incoming.map((alert) => alert.id));
        loadedRef.current = true;
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setLoading(false);
      }
    },
    [soundConfig]
  );

  useEffect(() => {
    void load(false);
    const interval = window.setInterval(() => void load(true), 30000);
    return () => window.clearInterval(interval);
  }, [load]);

  useEffect(() => {
    saveAlertSoundConfig(soundConfig);
  }, [soundConfig]);

  const filtered = useMemo(() => {
    if (severityFilter === "all") return alerts;
    return alerts.filter((alert) => alert.threat_level === severityFilter);
  }, [alerts, severityFilter]);

  const selectedRefs = useMemo(() => {
    if (!selected) return [];
    return buildMitigationReferences(selected);
  }, [selected]);

  const updateStatus = async (status: Alert["status"]) => {
    if (!selected) return;
    setUpdating(true);
    try {
      const response = await api.patch<Alert>(`/alerts/${selected.id}/`, { status });
      setSelected(response.data);
      setAlerts((prev) => prev.map((item) => (item.id === selected.id ? response.data : item)));
      toast.success("Alert status updated.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUpdating(false);
    }
  };

  const previewSound = () => {
    if (!soundConfig.enabled || soundConfig.scope === "off") {
      toast.info("Enable alert sound and choose a scope first.");
      return;
    }
    const previewSeverity = soundConfig.scope === "all" ? "high" : soundConfig.scope;
    void playAlertSound(previewSeverity, soundConfig.effect, soundConfig.volume);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alert Queue"
        subtitle="Open an alert to review LLM reasoning, mitigation guidance, and external references."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-48">
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger>
                  <Filter className="mr-2 h-4 w-4 text-muted" />
                  <SelectValue placeholder="Filter severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted">
              <Volume2 className="h-4 w-4" />
              Sound
              <Switch
                checked={soundConfig.enabled}
                onCheckedChange={(value) => setSoundConfig((prev) => ({ ...prev, enabled: value }))}
              />
            </label>
            <div className="w-40">
              <Select
                value={soundConfig.scope}
                onValueChange={(value) =>
                  setSoundConfig((prev) => ({ ...prev, scope: value as AlertSoundConfig["scope"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="critical">Critical only</SelectItem>
                  <SelectItem value="high">High only</SelectItem>
                  <SelectItem value="medium">Medium only</SelectItem>
                  <SelectItem value="low">Low only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-36">
              <Select
                value={soundConfig.effect}
                onValueChange={(value) =>
                  setSoundConfig((prev) => ({ ...prev, effect: value as AlertSoundConfig["effect"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pulse">Pulse</SelectItem>
                  <SelectItem value="siren">Siren</SelectItem>
                  <SelectItem value="beacon">Beacon</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={previewSound}>
              Test Sound
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <Skeleton className="h-[320px]" />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="No Alerts in Queue"
              description="When threat levels cross threshold, new alerts will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Timestamp</TH>
                    <TH>Hostname</TH>
                    <TH>Threat</TH>
                    <TH>Confidence</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {filtered.map((alert) => (
                    <TR key={alert.id} className="cursor-pointer" onClick={() => setSelected(alert)}>
                      <TD>{new Date(alert.created_at).toLocaleString()}</TD>
                      <TD>{alert.agent?.hostname ?? "unknown"}</TD>
                      <TD>
                        <Badge className={threatColor(alert.threat_level)}>{alert.threat_level}</Badge>
                      </TD>
                      <TD>{alert.confidence}%</TD>
                      <TD>{statusLabel[alert.status]}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="overflow-y-auto">
          {selected ? (
            <div className="space-y-5">
              <SheetTitle>Alert #{selected.id}</SheetTitle>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase text-muted">Host</p>
                  <p>{selected.agent?.hostname ?? "unknown"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted">Created</p>
                  <p>{formatRelative(selected.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted">Threat</p>
                  <Badge className={threatColor(selected.threat_level)}>{selected.threat_level}</Badge>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted">Confidence</p>
                  <p>{selected.confidence}%</p>
                </div>
              </div>

              <div className="space-y-2 rounded-lg border border-border bg-background p-4">
                <p className="text-xs uppercase text-muted">Reasoning</p>
                <p className="text-sm">{String(selected.llm_analysis.reasoning ?? "No reasoning available.")}</p>
              </div>
              <div className="space-y-2 rounded-lg border border-border bg-background p-4">
                <p className="text-xs uppercase text-muted">Recommended Action</p>
                <p className="text-sm">
                  {String(selected.llm_analysis.recommended_action ?? "No recommended action available.")}
                </p>
              </div>

              <div className="space-y-2 rounded-lg border border-border bg-background p-4">
                <p className="text-xs uppercase text-muted">Mitigation References</p>
                <div className="grid gap-2">
                  {selectedRefs.map((ref) => (
                    <a
                      key={ref.label}
                      href={ref.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-border p-3 text-sm transition hover:bg-card"
                    >
                      <p className="flex items-center gap-2 font-medium text-foreground">
                        <ExternalLink className="h-4 w-4 text-accent" />
                        {ref.label}
                      </p>
                      <p className="mt-1 text-xs text-muted">{ref.description}</p>
                    </a>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <p className="text-xs uppercase text-muted">Set Status</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => void updateStatus("open")} disabled={updating}>
                    Active
                  </Button>
                  <Button variant="outline" onClick={() => void updateStatus("in_progress")} disabled={updating}>
                    Investigating
                  </Button>
                  <Button variant="default" onClick={() => void updateStatus("resolved")} disabled={updating}>
                    Closed
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
