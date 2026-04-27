import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  Signal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import {
  buildMitigationReferences,
  loadAlertSoundConfig,
  pickMostSevereMatchingAlert,
  playAlertSound,
} from "@/lib/alertTools";
import { formatRelative } from "@/lib/utils";
import type { Alert, DashboardOverview } from "@/types/api";

const THREAT_COLORS = {
  critical: "#ff416f",
  high: "#ff7a45",
  medium: "#ffd24d",
  low: "#4aa3ff",
};

const severityPillClass: Record<string, string> = {
  critical: "border-[#ff416f]/60 bg-[#ff416f]/15 text-[#ff6f8f]",
  high: "border-[#ff7a45]/60 bg-[#ff7a45]/15 text-[#ff995f]",
  medium: "border-[#ffd24d]/60 bg-[#ffd24d]/15 text-[#ffe181]",
  low: "border-[#4aa3ff]/60 bg-[#4aa3ff]/15 text-[#7dbbff]",
};

const statusMap: Record<
  Alert["status"],
  {
    label: string;
    icon: typeof Activity;
    className: string;
  }
> = {
  open: {
    label: "Active",
    icon: AlertTriangle,
    className: "text-[#ff6f8f]",
  },
  in_progress: {
    label: "Investigating",
    icon: Activity,
    className: "text-[#d09bff]",
  },
  resolved: {
    label: "Resolved",
    icon: CheckCircle2,
    className: "text-[#7dbbff]",
  },
};

const severityOrder = ["critical", "high", "medium", "low"] as const;

function formatAlertId(alertId: number): string {
  const year = new Date().getFullYear();
  return `ALT-${year}-${String(alertId).padStart(3, "0")}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function DashboardPage() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [selected, setSelected] = useState<Alert | null>(null);

  const knownIdsRef = useRef<Set<number>>(new Set());
  const initializedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const [overviewRes, alertsRes] = await Promise.all([
        api.get<DashboardOverview>("/dashboard/overview/"),
        api.get<Alert[]>("/alerts/"),
      ]);
      setOverview(overviewRes.data);

      const incomingAlerts = alertsRes.data;
      if (initializedRef.current) {
        const config = loadAlertSoundConfig();
        const newAlerts = incomingAlerts.filter((alert) => !knownIdsRef.current.has(alert.id));
        const match = pickMostSevereMatchingAlert(newAlerts, config);
        if (match) {
          void playAlertSound(match.threat_level, config.effect, config.volume);
        }
      }
      setAlerts(incomingAlerts);
      knownIdsRef.current = new Set(incomingAlerts.map((alert) => alert.id));
      initializedRef.current = true;
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refreshInterval = window.setInterval(() => void load(), 30000);
    const clockInterval = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearInterval(refreshInterval);
      window.clearInterval(clockInterval);
    };
  }, [load]);

  const severityCounts = useMemo(() => {
    const base = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const item of overview?.threat_distribution ?? []) {
      if (item.threat_level in base) {
        base[item.threat_level as keyof typeof base] = item.count;
      }
    }
    return base;
  }, [overview]);

  const chartData = useMemo(
    () =>
      severityOrder.map((level) => ({
        threat_level: level,
        count: severityCounts[level],
        color: THREAT_COLORS[level],
      })),
    [severityCounts]
  );

  const recentAlerts = useMemo(() => alerts.slice(0, 5), [alerts]);
  const activeAlerts = useMemo(() => alerts.filter((item) => item.status !== "resolved"), [alerts]);
  const selectedRefs = useMemo(() => (selected ? buildMitigationReferences(selected) : []), [selected]);

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-[#9b5cff]/35 bg-[#05020a] px-6 py-10 text-center shadow-[0_0_45px_rgba(155,92,255,0.2)] md:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(155,92,255,0.25),transparent_45%),radial-gradient(circle_at_80%_120%,rgba(115,65,200,0.22),transparent_40%)]" />
        <div className="relative space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-[#cfa6ff]">ScropIDS Threat Monitor</p>
          <h1 className="text-4xl font-semibold tracking-tight text-[#c889ff] md:text-6xl">Live Threat Dashboard</h1>
          <p className="mx-auto max-w-2xl text-sm text-[#b589f0] md:text-lg">
            Real-time IDS monitoring for active threats across your endpoints
            {overview ? ` · ${overview.organization.name}` : ""}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-[#a469ff]/55 bg-[#090311] p-5 shadow-[0_0_35px_rgba(164,105,255,0.35)] md:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-[#8f4dff]/35 pb-4">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-[#b978ff] shadow-[0_0_16px_rgba(185,120,255,0.95)]" />
            <p className="text-2xl font-semibold text-[#e9d1ff]">Active Alerts</p>
          </div>
          <div className="flex items-center gap-4 text-sm text-[#be9be9]">
            <span className="inline-flex items-center gap-2">
              <Signal className="h-4 w-4 animate-pulseSlow text-[#d29bff]" />
              System Status: <strong className="text-[#dbaeff]">Monitoring</strong>
            </span>
            <span>{now.toLocaleTimeString()}</span>
          </div>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {severityOrder.map((level) => (
            <div
              key={level}
              className="rounded-xl border border-[#9e63ff]/55 bg-[#11041d] px-4 py-3 shadow-[0_0_22px_rgba(158,99,255,0.28)]"
            >
              <p className="text-center text-3xl font-semibold" style={{ color: THREAT_COLORS[level] }}>
                {severityCounts[level]}
              </p>
              <p className="text-center text-sm capitalize text-[#ba97e6]">{level}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <Skeleton className="h-[300px] bg-[#130725]" />
        ) : recentAlerts.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="No Alerts Yet"
            description="Once detections are generated, this live table will populate automatically."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR className="border-[#8f4dff]/35">
                  <TH className="text-[#bc93f2]">ID</TH>
                  <TH className="text-[#bc93f2]">Time</TH>
                  <TH className="text-[#bc93f2]">Severity</TH>
                  <TH className="text-[#bc93f2]">Source</TH>
                  <TH className="text-[#bc93f2]">Threat Description</TH>
                  <TH className="text-[#bc93f2]">Status</TH>
                </TR>
              </THead>
              <TBody>
                {recentAlerts.map((alert) => {
                  const status = statusMap[alert.status];
                  const Icon = status.icon;
                  const severityClass = severityPillClass[alert.threat_level] ?? severityPillClass.low;
                  return (
                    <TR
                      key={alert.id}
                      className="cursor-pointer border-[#8f4dff]/25 hover:bg-[#1a0a30]"
                      onClick={() => setSelected(alert)}
                    >
                      <TD className="font-mono text-[#debbff]">{formatAlertId(alert.id)}</TD>
                      <TD className="text-[#cfb0f2]">{formatTime(alert.created_at)}</TD>
                      <TD>
                        <Badge className={`capitalize ${severityClass}`}>{alert.threat_level}</Badge>
                      </TD>
                      <TD className="font-mono text-[#cfb0f2]">{alert.agent?.ip_address ?? "unknown"}</TD>
                      <TD className="max-w-[420px] truncate text-[#cfb0f2]">
                        {String(alert.llm_analysis.reasoning ?? "No threat details")}
                      </TD>
                      <TD>
                        <span className={`inline-flex items-center gap-2 ${status.className}`}>
                          <Icon className="h-4 w-4" />
                          {status.label}
                        </span>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#8f4dff]/35 pt-4 text-sm text-[#be9be9]">
          <p>Showing {recentAlerts.length} alerts · Active: {activeAlerts.length}</p>
          <Button
            asChild
            variant="outline"
            className="border-[#a469ff] bg-transparent text-[#d7b2ff] hover:bg-[#2a0f46] hover:text-white"
          >
            <Link to="/alerts">View All Alerts</Link>
          </Button>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-[#8f4dff]/35 bg-[#090311] p-4">
          <p className="mb-4 text-sm font-medium uppercase tracking-wide text-[#c89ef9]">Threat Distribution (7d)</p>
          {loading ? (
            <Skeleton className="h-[260px] bg-[#130725]" />
          ) : chartData.every((item) => item.count === 0) ? (
            <EmptyState
              icon={AlertTriangle}
              title="No Threat Records"
              description="Threat distribution appears here when alerts are generated for this tenant."
            />
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} dataKey="count" nameKey="threat_level" innerRadius={60} outerRadius={95}>
                    {chartData.map((entry) => (
                      <Cell key={entry.threat_level} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#8f4dff]/35 bg-[#090311] p-4">
          <p className="mb-4 text-sm font-medium uppercase tracking-wide text-[#c89ef9]">Confidence Heatmap (24h)</p>
          {loading ? (
            <Skeleton className="h-[260px] bg-[#130725]" />
          ) : (overview?.confidence_heatmap.length ?? 0) === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="No Confidence Data"
              description="LLM confidence averages appear once alerts are analyzed."
            />
          ) : (
            <div className="space-y-2">
              {overview?.confidence_heatmap.map((item) => (
                <div key={item.agent__hostname} className="rounded-lg border border-[#7c46d3]/45 bg-[#11041d] p-3">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium text-[#e2c4ff]">{item.agent__hostname}</span>
                    <span className="text-[#d2aef4]">{Math.round(item.avg_confidence ?? 0)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#230b3d]">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-[#8f4dff] to-[#ff6fca]"
                      style={{ width: `${Math.min(100, Math.max(0, Math.round(item.avg_confidence ?? 0)))}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-[#b98de8]">Alerts: {item.count}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="overflow-y-auto">
          {selected ? (
            <div className="space-y-5">
              <SheetTitle>{formatAlertId(selected.id)}</SheetTitle>
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
                  <Badge className={severityPillClass[selected.threat_level] ?? severityPillClass.low}>
                    {selected.threat_level}
                  </Badge>
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
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
