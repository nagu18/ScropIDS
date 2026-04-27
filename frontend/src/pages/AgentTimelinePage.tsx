import { ArrowLeft, BrainCircuit, History, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api";
import { threatColor } from "@/lib/utils";
import type { AgentTimeline } from "@/types/api";

type EventCategory = "process" | "network" | "system" | "security" | "file" | "other";
const PAGE_SIZE = 20;

function categoryFromType(eventType: string): EventCategory {
  const value = eventType.toLowerCase();
  if (value.includes("process")) return "process";
  if (value.includes("network")) return "network";
  if (value.includes("system")) return "system";
  if (value.includes("auth") || value.includes("login") || value.includes("security")) return "security";
  if (value.includes("file")) return "file";
  return "other";
}

function categoryLabel(category: EventCategory): string {
  if (category === "process") return "Process Logs";
  if (category === "network") return "Network Logs";
  if (category === "system") return "System Logs";
  if (category === "security") return "Security Logs";
  if (category === "file") return "File Logs";
  return "Other Logs";
}

export function AgentTimelinePage() {
  const { agentId } = useParams<{ agentId: string }>();
  const [timeline, setTimeline] = useState<AgentTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<"all" | "critical" | "high" | "medium" | "low">("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | EventCategory>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!agentId) return;
    (async () => {
      try {
        const response = await api.get<AgentTimeline>(`/agents/${agentId}/timeline/`);
        setTimeline(response.data);
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setLoading(false);
      }
    })();
  }, [agentId]);

  const criticalCount = useMemo(
    () => timeline?.events.filter((event) => event.severity === "critical" || event.severity === "high").length ?? 0,
    [timeline]
  );

  const filteredEvents = useMemo(() => {
    const source = timeline?.events ?? [];
    const normalizedQuery = query.trim().toLowerCase();
    return source.filter((event) => {
      const eventCategory = categoryFromType(event.event_type);
      if (severityFilter !== "all" && event.severity !== severityFilter) return false;
      if (categoryFilter !== "all" && eventCategory !== categoryFilter) return false;
      if (!normalizedQuery) return true;
      const haystack = `${event.event_type} ${event.severity} ${JSON.stringify(event.data)}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [timeline?.events, query, severityFilter, categoryFilter]);

  useEffect(() => {
    setPage(1);
  }, [query, severityFilter, categoryFilter, timeline?.events.length]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pagedEvents = useMemo(() => {
    const start = (pageSafe - 1) * PAGE_SIZE;
    return filteredEvents.slice(start, start + PAGE_SIZE);
  }, [filteredEvents, pageSafe]);

  const groupedEvents = useMemo(() => {
    const out: Record<string, Record<EventCategory, AgentTimeline["events"]>> = {};
    const order: EventCategory[] = ["security", "process", "network", "system", "file", "other"];
    for (const event of pagedEvents) {
      const dayKey = new Date(event.timestamp).toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const category = categoryFromType(event.event_type);
      if (!out[dayKey]) {
        out[dayKey] = {
          process: [],
          network: [],
          system: [],
          security: [],
          file: [],
          other: [],
        };
      }
      out[dayKey][category].push(event);
    }
    return { grouped: out, order };
  }, [pagedEvents]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={timeline?.agent.hostname ? `${timeline.agent.hostname} Timeline` : "Agent Timeline"}
        subtitle="Chronological endpoint event feed with latest LLM insights."
        action={
          <Button asChild variant="outline">
            <Link to="/agents">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to agents
            </Link>
          </Button>
        }
      />

      {loading ? (
        <Skeleton className="h-[420px]" />
      ) : !timeline ? (
        <EmptyState
          icon={History}
          title="Timeline Not Available"
          description="No timeline data could be loaded for this endpoint."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <div className="space-y-3">
                <CardTitle className="flex items-center justify-between">
                  <span>Event Feed</span>
                  <Badge className={criticalCount > 0 ? "border-danger/50 bg-danger/20 text-danger" : ""}>
                    High/Critical: {criticalCount}
                  </Badge>
                </CardTitle>
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted" />
                    <Input
                      className="pl-8"
                      placeholder="Search event type, message, IP, command..."
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                  <Select value={severityFilter} onValueChange={(value) => setSeverityFilter(value as typeof severityFilter)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severities</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as typeof categoryFilter)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="security">Security Logs</SelectItem>
                      <SelectItem value="process">Process Logs</SelectItem>
                      <SelectItem value="network">Network Logs</SelectItem>
                      <SelectItem value="system">System Logs</SelectItem>
                      <SelectItem value="file">File Logs</SelectItem>
                      <SelectItem value="other">Other Logs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>
                    Showing {pagedEvents.length} of {filteredEvents.length} filtered events
                  </span>
                  <span>
                    Page {pageSafe} / {totalPages}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredEvents.length === 0 ? (
                <EmptyState icon={History} title="No Events Yet" description="Endpoint has not submitted timeline events." />
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedEvents.grouped).map(([day, byCategory]) => (
                    <div key={day} className="space-y-3 rounded-lg border border-border/70 bg-background/60 p-3">
                      <p className="text-sm font-semibold text-slate-100">{day}</p>
                      {groupedEvents.order.map((category) => {
                        const events = byCategory[category];
                        if (!events || events.length === 0) return null;
                        return (
                          <div key={`${day}-${category}`} className="space-y-2 rounded-md border border-border/60 p-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs uppercase tracking-wide text-muted">{categoryLabel(category)}</p>
                              <Badge variant="outline">{events.length}</Badge>
                            </div>
                            {events.map((event) => (
                              <div key={event.id} className="rounded-lg border border-border bg-background p-3">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <Badge className={threatColor(event.severity)}>{event.severity}</Badge>
                                    <span className="font-medium">{event.event_type}</span>
                                  </div>
                                  <span className="text-xs text-muted">
                                    {new Date(event.timestamp).toLocaleTimeString()} · {new Date(event.timestamp).toLocaleDateString()}
                                  </span>
                                </div>
                                <pre className="overflow-x-auto rounded bg-black/20 p-2 text-xs text-slate-200">
                                  {JSON.stringify(event.data, null, 2)}
                                </pre>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pageSafe <= 1}
                      onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pageSafe >= totalPages}
                      onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BrainCircuit className="h-4 w-4 text-accent" />
                LLM Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.llm_insights.length === 0 ? (
                <EmptyState
                  icon={BrainCircuit}
                  title="No LLM Insight"
                  description="Insights appear after aggregation and model analysis."
                />
              ) : (
                <div className="space-y-3">
                  {timeline.llm_insights.map((insight) => (
                    <div key={insight.aggregate_id} className="rounded-lg border border-border bg-background p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <Badge className={threatColor(insight.threat_level ?? "low")}>{insight.threat_level ?? "low"}</Badge>
                        <span className="text-xs text-muted">{insight.confidence ?? 0}%</span>
                      </div>
                      <p className="mb-2 text-sm text-slate-100">{insight.reasoning ?? "No reasoning"}</p>
                      <p className="text-xs text-muted">{insight.recommended_action ?? "No action recommendation."}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
