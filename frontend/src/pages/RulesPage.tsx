import { Download, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage } from "@/lib/api";
import type { SchedulerConfig } from "@/types/api";

type ThreatLevel = "low" | "medium" | "high" | "critical";
type RuleEditor = {
  enabled: boolean;
  failed_logins_gte: number;
  suspicious_commands_gte: number;
  external_connections_gte: number;
  new_processes_gte: number;
  event_count_gte: number;
  set_threat: ThreatLevel;
  min_confidence: number;
};

type RuleConfigJson = {
  built_in_rules: Record<string, RuleEditor>;
  custom_rules: Array<Record<string, unknown>>;
};

const defaultRule: RuleEditor = {
  enabled: true,
  failed_logins_gte: 0,
  suspicious_commands_gte: 0,
  external_connections_gte: 0,
  new_processes_gte: 0,
  event_count_gte: 0,
  set_threat: "high",
  min_confidence: 85,
};

const defaultConfig: RuleConfigJson = {
  built_in_rules: {
    multi_signal_attack_combo: {
      ...defaultRule,
      failed_logins_gte: 5,
      suspicious_commands_gte: 1,
      external_connections_gte: 1,
      set_threat: "high",
      min_confidence: 85,
    },
    severe_correlated_activity: {
      ...defaultRule,
      failed_logins_gte: 8,
      suspicious_commands_gte: 2,
      external_connections_gte: 2,
      set_threat: "critical",
      min_confidence: 92,
    },
    process_obfuscation_burst: {
      ...defaultRule,
      suspicious_commands_gte: 2,
      new_processes_gte: 5,
      set_threat: "high",
      min_confidence: 85,
    },
    external_connection_spike: {
      ...defaultRule,
      external_connections_gte: 3,
      set_threat: "high",
      min_confidence: 85,
    },
  },
  custom_rules: [],
};

const ruleLabels: Record<string, string> = {
  multi_signal_attack_combo: "Multi-signal Attack Combo",
  severe_correlated_activity: "Severe Correlated Activity",
  process_obfuscation_burst: "Process Obfuscation Burst",
  external_connection_spike: "External Connection Spike",
};

function parseRuleConfig(value: unknown): RuleConfigJson {
  if (!value || typeof value !== "object") return defaultConfig;
  const source = value as Record<string, unknown>;
  const builtIn = source.built_in_rules;
  const custom = source.custom_rules;
  return {
    built_in_rules: {
      ...defaultConfig.built_in_rules,
      ...(typeof builtIn === "object" && builtIn ? (builtIn as Record<string, RuleEditor>) : {}),
    },
    custom_rules: Array.isArray(custom) ? (custom as Array<Record<string, unknown>>) : [],
  };
}

export function RulesPage() {
  const [config, setConfig] = useState<SchedulerConfig | null>(null);
  const [ruleConfig, setRuleConfig] = useState<RuleConfigJson>(defaultConfig);
  const [customRulesText, setCustomRulesText] = useState("[]");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await api.get<SchedulerConfig[]>("/scheduler-configs/");
        const next = response.data[0] ?? null;
        setConfig(next);
        const parsed = parseRuleConfig(next?.rule_config_json);
        setRuleConfig(parsed);
        setCustomRulesText(JSON.stringify(parsed.custom_rules ?? [], null, 2));
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const ruleEntries = useMemo(() => Object.entries(ruleConfig.built_in_rules), [ruleConfig.built_in_rules]);

  const updateRule = (key: string, patch: Partial<RuleEditor>) => {
    setRuleConfig((prev) => ({
      ...prev,
      built_in_rules: {
        ...prev.built_in_rules,
        [key]: {
          ...(prev.built_in_rules[key] ?? defaultRule),
          ...patch,
        },
      },
    }));
  };

  const importFromUrl = async () => {
    if (!config?.rule_pack_source_url) {
      toast.error("Set rule pack URL first.");
      return;
    }
    try {
      const response = await fetch(config.rule_pack_source_url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as unknown;
      const parsed = parseRuleConfig(payload);
      setRuleConfig(parsed);
      setCustomRulesText(JSON.stringify(parsed.custom_rules ?? [], null, 2));
      toast.success("Rule pack imported.");
    } catch (error) {
      toast.error(`Import failed: ${errorMessage(error)}`);
    }
  };

  const downloadRules = () => {
    const blob = new Blob([JSON.stringify(ruleConfig, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "scropids-rule-pack.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const parsedCustom = JSON.parse(customRulesText);
      if (!Array.isArray(parsedCustom)) {
        throw new Error("Custom rules JSON must be an array.");
      }
      const payload = {
        rule_engine_enabled: config.rule_engine_enabled,
        rule_pack_source_url: config.rule_pack_source_url,
        rule_config_json: {
          ...ruleConfig,
          custom_rules: parsedCustom,
        },
      };
      const response = await api.patch<SchedulerConfig>(`/scheduler-configs/${config.id}/`, payload);
      setConfig(response.data);
      const normalized = parseRuleConfig(response.data.rule_config_json);
      setRuleConfig(normalized);
      setCustomRulesText(JSON.stringify(normalized.custom_rules ?? [], null, 2));
      toast.success("Rules configuration saved.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="space-y-4">
        <PageHeader title="Rules" subtitle="Detection rule engine configuration and rule packs." />
        <div className="h-48 animate-pulse rounded bg-slate-700/20" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Rules" subtitle="Configure escalation rules, import rule packs, and add custom detections." />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-accent" />
            Rule Engine
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
            Enable Rule Escalation Engine
            <Switch
              checked={config.rule_engine_enabled}
              onCheckedChange={(value) => setConfig((prev) => (prev ? { ...prev, rule_engine_enabled: value } : prev))}
            />
          </label>
          <div className="grid gap-2">
            <p className="text-xs uppercase tracking-wide text-muted">Rule Pack URL (Internet)</p>
            <div className="flex gap-2">
              <Input
                value={config.rule_pack_source_url}
                placeholder="https://example.com/scropids-rule-pack.json"
                onChange={(event) =>
                  setConfig((prev) => (prev ? { ...prev, rule_pack_source_url: event.target.value } : prev))
                }
              />
              <Button type="button" variant="outline" onClick={() => void importFromUrl()}>
                Import
              </Button>
              <Button type="button" variant="outline" onClick={downloadRules}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Built-in Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {ruleEntries.map(([key, rule]) => (
            <div key={key} className="space-y-3 rounded-lg border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">{ruleLabels[key] ?? key}</p>
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={(value) => updateRule(key, { enabled: value })}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Input
                  type="number"
                  min={0}
                  value={rule.failed_logins_gte}
                  onChange={(event) => updateRule(key, { failed_logins_gte: Number(event.target.value) })}
                  placeholder="failed_logins_gte"
                />
                <Input
                  type="number"
                  min={0}
                  value={rule.suspicious_commands_gte}
                  onChange={(event) => updateRule(key, { suspicious_commands_gte: Number(event.target.value) })}
                  placeholder="suspicious_commands_gte"
                />
                <Input
                  type="number"
                  min={0}
                  value={rule.external_connections_gte}
                  onChange={(event) => updateRule(key, { external_connections_gte: Number(event.target.value) })}
                  placeholder="external_connections_gte"
                />
                <Input
                  type="number"
                  min={0}
                  value={rule.new_processes_gte}
                  onChange={(event) => updateRule(key, { new_processes_gte: Number(event.target.value) })}
                  placeholder="new_processes_gte"
                />
                <Input
                  type="number"
                  min={0}
                  value={rule.event_count_gte}
                  onChange={(event) => updateRule(key, { event_count_gte: Number(event.target.value) })}
                  placeholder="event_count_gte"
                />
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={rule.min_confidence}
                  onChange={(event) => updateRule(key, { min_confidence: Number(event.target.value) })}
                  placeholder="min_confidence"
                />
              </div>
              <div className="max-w-[220px]">
                <Select value={rule.set_threat} onValueChange={(value) => updateRule(key, { set_threat: value as ThreatLevel })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Set threat level" />
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
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom Rules JSON</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted">
            Add custom rules as JSON array. Fields supported per rule: `id`, `enabled`, `failed_logins_gte`, `suspicious_commands_gte`, `external_connections_gte`, `new_processes_gte`, `event_count_gte`, `set_threat`, `min_confidence`.
          </p>
          <textarea
            className="min-h-48 w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-slate-100"
            value={customRulesText}
            onChange={(event) => setCustomRulesText(event.target.value)}
          />
        </CardContent>
      </Card>

      <Button onClick={() => void save()} disabled={saving}>
        {saving ? "Saving..." : "Save Rules"}
      </Button>
    </div>
  );
}
