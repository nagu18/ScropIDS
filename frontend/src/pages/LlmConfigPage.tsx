import { Bot, KeyRound, Pencil, PlusCircle, Server, Trash2, Workflow, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import type { LlmProvider } from "@/types/api";

type ProviderForm = {
  name: string;
  provider_type: "openai_compatible" | "ollama";
  base_url: string;
  model: string;
  timeout_seconds: number;
  api_key: string;
  is_active: boolean;
};

const defaultForm: ProviderForm = {
  name: "",
  provider_type: "openai_compatible",
  base_url: "",
  model: "",
  timeout_seconds: 30,
  api_key: "",
  is_active: false,
};

type ProviderMode = "api" | "local";
type ProviderPricing = "free" | "paid" | "free_paid";

type ProviderProfile = {
  id: string;
  label: string;
  mode: ProviderMode;
  pricing: ProviderPricing;
  provider_type: ProviderForm["provider_type"];
  base_url: string;
  model: string;
  note: string;
  auth: "required" | "optional";
};

const providerProfiles: ProviderProfile[] = [
  {
    id: "openai",
    label: "OpenAI API",
    mode: "api",
    pricing: "paid",
    provider_type: "openai_compatible",
    base_url: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    note: "Official OpenAI endpoint.",
    auth: "required",
  },
  {
    id: "openrouter",
    label: "OpenRouter API",
    mode: "api",
    pricing: "free_paid",
    provider_type: "openai_compatible",
    base_url: "https://openrouter.ai/api/v1",
    model: "meta-llama/llama-3.1-8b-instruct:free",
    note: "OpenAI-compatible multi-model router.",
    auth: "required",
  },
  {
    id: "groq",
    label: "Groq API",
    mode: "api",
    pricing: "free_paid",
    provider_type: "openai_compatible",
    base_url: "https://api.groq.com/openai/v1",
    model: "llama-3.1-8b-instant",
    note: "Low-latency OpenAI-compatible API.",
    auth: "required",
  },
  {
    id: "custom-api",
    label: "Custom Compatible API",
    mode: "api",
    pricing: "free_paid",
    provider_type: "openai_compatible",
    base_url: "https://your-endpoint.example/v1",
    model: "model-name",
    note: "Any OpenAI-compatible endpoint.",
    auth: "required",
  },
  {
    id: "ollama",
    label: "Ollama Local",
    mode: "local",
    pricing: "free",
    provider_type: "ollama",
    base_url: "http://host.docker.internal:11434",
    model: "llama3.2:3b",
    note: "Runs local models through Ollama.",
    auth: "optional",
  },
  {
    id: "lmstudio",
    label: "LM Studio Local",
    mode: "local",
    pricing: "free",
    provider_type: "openai_compatible",
    base_url: "http://host.docker.internal:1234/v1",
    model: "local-model",
    note: "Local OpenAI-compatible endpoint from LM Studio.",
    auth: "optional",
  },
];

const defaultProfile = providerProfiles[0];

const modeBadgeStyle: Record<ProviderMode, string> = {
  api: "border-accent/50 bg-accent/20 text-accent",
  local: "border-safe/50 bg-safe/20 text-safe",
};

const pricingBadgeStyle: Record<ProviderPricing, string> = {
  free: "border-safe/50 bg-safe/20 text-safe",
  paid: "border-danger/50 bg-danger/20 text-danger",
  free_paid: "border-warning/50 bg-warning/20 text-warning",
};

const pricingLabel: Record<ProviderPricing, string> = {
  free: "Free",
  paid: "Paid",
  free_paid: "Free + Paid",
};

const formFromProfile = (profile: ProviderProfile): ProviderForm => ({
  ...defaultForm,
  name: profile.label,
  provider_type: profile.provider_type,
  base_url: profile.base_url,
  model: profile.model,
});

export function LlmConfigPage() {
  const [items, setItems] = useState<LlmProvider[]>([]);
  const [providerMode, setProviderMode] = useState<ProviderMode>(defaultProfile.mode);
  const [presetModeFilter, setPresetModeFilter] = useState<ProviderMode | "all">("all");
  const [selectedProfileId, setSelectedProfileId] = useState(defaultProfile.id);
  const [form, setForm] = useState<ProviderForm>(() => formFromProfile(defaultProfile));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const activeProfiles = providerProfiles.filter((profile) => profile.mode === providerMode);
  const visiblePresets =
    presetModeFilter === "all"
      ? providerProfiles
      : providerProfiles.filter((profile) => profile.mode === presetModeFilter);
  const selectedProfile =
    providerProfiles.find((profile) => profile.id === selectedProfileId) ??
    activeProfiles[0] ??
    defaultProfile;

  const load = async () => {
    try {
      const response = await api.get<LlmProvider[]>("/llm-providers/");
      setItems(response.data);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const upsertProvider = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingId !== null) {
        await api.patch(`/llm-providers/${editingId}/`, form);
        toast.success("Provider updated.");
      } else {
        await api.post("/llm-providers/", form);
        toast.success("Provider created.");
      }
      setForm(formFromProfile(selectedProfile));
      setEditingId(null);
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (provider: LlmProvider, value: boolean) => {
    try {
      await api.patch(`/llm-providers/${provider.id}/`, { is_active: value });
      toast.success("Provider updated.");
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const beginEdit = (provider: LlmProvider) => {
    setEditingId(provider.id);
    setProviderMode(provider.provider_type === "ollama" ? "local" : "api");
    setForm({
      name: provider.name,
      provider_type: provider.provider_type,
      base_url: provider.base_url,
      model: provider.model,
      timeout_seconds: provider.timeout_seconds,
      api_key: "",
      is_active: provider.is_active,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(formFromProfile(selectedProfile));
  };

  const deleteProvider = async (provider: LlmProvider) => {
    if (!window.confirm(`Delete provider '${provider.name}'?`)) return;
    setDeletingId(provider.id);
    try {
      await api.delete(`/llm-providers/${provider.id}/`);
      toast.success("Provider deleted.");
      if (editingId === provider.id) {
        cancelEdit();
      }
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeletingId(null);
    }
  };

  const applyProfile = (profile: ProviderProfile) => {
    setProviderMode(profile.mode);
    setSelectedProfileId(profile.id);
    setForm((prev) => ({
      ...prev,
      name: profile.label,
      provider_type: profile.provider_type,
      base_url: profile.base_url,
      model: profile.model,
    }));
    toast.info(`Preset applied: ${profile.label}`);
  };

  const setMode = (mode: ProviderMode) => {
    setProviderMode(mode);
    const firstMatch = providerProfiles.find((profile) => profile.mode === mode);
    if (!firstMatch) return;
    setSelectedProfileId(firstMatch.id);
    setForm((prev) => ({
      ...prev,
      name: firstMatch.label,
      provider_type: firstMatch.provider_type,
      base_url: firstMatch.base_url,
      model: firstMatch.model,
    }));
  };

  const providerTypeLabel = (provider: LlmProvider): string => {
    if (provider.provider_type === "ollama") return "Local (Ollama)";
    return "OpenAI-Compatible";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="LLM Providers"
        subtitle="Pick a preset, see Free/Paid clearly, and save provider credentials for your tenant."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-accent" />
            Provider Presets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={presetModeFilter === "all" ? "default" : "outline"}
              onClick={() => setPresetModeFilter("all")}
            >
              All
            </Button>
            <Button
              type="button"
              size="sm"
              variant={presetModeFilter === "api" ? "default" : "outline"}
              onClick={() => setPresetModeFilter("api")}
            >
              API
            </Button>
            <Button
              type="button"
              size="sm"
              variant={presetModeFilter === "local" ? "default" : "outline"}
              onClick={() => setPresetModeFilter("local")}
            >
              Local
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visiblePresets.map((profile) => (
              <div key={profile.id} className="rounded-lg border border-border bg-background p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="mr-auto text-sm font-semibold text-foreground">{profile.label}</p>
                  <Badge className={modeBadgeStyle[profile.mode]}>{profile.mode.toUpperCase()}</Badge>
                  <Badge className={pricingBadgeStyle[profile.pricing]}>{pricingLabel[profile.pricing]}</Badge>
                </div>
                <p className="mb-3 text-xs text-muted">{profile.note}</p>
                <p className="mb-1 truncate text-[11px] text-slate-300">URL: {profile.base_url}</p>
                <p className="mb-3 truncate text-[11px] text-slate-300">Model: {profile.model}</p>
                <Button size="sm" variant="outline" onClick={() => applyProfile(profile)}>
                  Use Preset
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4 text-accent" />
              Add Provider
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={upsertProvider}>
              <div className="grid gap-2">
                <p className="text-xs uppercase tracking-wide text-muted">Connection Mode</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={providerMode === "api" ? "default" : "outline"}
                    onClick={() => setMode("api")}
                  >
                    <Workflow className="mr-2 h-4 w-4" />
                    API
                  </Button>
                  <Button
                    type="button"
                    variant={providerMode === "local" ? "default" : "outline"}
                    onClick={() => setMode("local")}
                  >
                    <Server className="mr-2 h-4 w-4" />
                    Local
                  </Button>
                </div>
              </div>
              <Select value={selectedProfileId} onValueChange={(value) => applyProfile(providerProfiles.find((p) => p.id === value) ?? defaultProfile)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {activeProfiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                      {profile.label} ({pricingLabel[profile.pricing]})
                  </SelectItem>
                ))}
              </SelectContent>
              </Select>
              <div className="rounded-md border border-border bg-background p-2 text-xs text-muted">
                <p>{selectedProfile.note}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline">{selectedProfile.auth === "required" ? "API key required" : "API key optional"}</Badge>
                  <Badge variant="outline">{selectedProfile.provider_type === "ollama" ? "native local" : "compatible API"}</Badge>
                </div>
              </div>
              <Input
                placeholder="Name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
              <Input
                placeholder={providerMode === "local" ? "Base URL (e.g. http://host.docker.internal:11434)" : "Base URL (e.g. https://api.openai.com/v1)"}
                value={form.base_url}
                onChange={(event) => setForm((prev) => ({ ...prev, base_url: event.target.value }))}
                required
              />
              <Input
                placeholder="Model name"
                value={form.model}
                onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
                required
              />
              <Input
                placeholder="Timeout seconds"
                type="number"
                min={1}
                value={form.timeout_seconds}
                onChange={(event) => setForm((prev) => ({ ...prev, timeout_seconds: Number(event.target.value) }))}
                required
              />
              <Input
                type="password"
                placeholder={selectedProfile.auth === "required" ? "API key" : "API key (optional)"}
                value={form.api_key}
                onChange={(event) => setForm((prev) => ({ ...prev, api_key: event.target.value }))}
              />
              <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                Activate immediately
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(value) => setForm((prev) => ({ ...prev, is_active: value }))}
                />
              </label>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                <KeyRound className="mr-2 h-4 w-4" />
                {saving ? "Saving..." : editingId !== null ? "Update Provider" : "Save Provider"}
                </Button>
                {editingId !== null ? (
                  <Button type="button" variant="outline" onClick={cancelEdit}>
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-accent" />
              Configured Providers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-48 animate-pulse rounded bg-slate-700/20" />
            ) : items.length === 0 ? (
              <EmptyState icon={Bot} title="No Providers" description="Add your first LLM provider to enable model analysis." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>Name</TH>
                      <TH>Type</TH>
                      <TH>Model</TH>
                      <TH>API Key</TH>
                      <TH>Active</TH>
                      <TH>Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {items.map((item) => (
                      <TR key={item.id}>
                        <TD>{item.name}</TD>
                        <TD>{providerTypeLabel(item)}</TD>
                        <TD>{item.model}</TD>
                        <TD>{item.masked_api_key || "not set"}</TD>
                        <TD>
                          <Switch checked={item.is_active} onCheckedChange={(v) => void toggleActive(item, v)} />
                        </TD>
                        <TD>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => beginEdit(item)}>
                              <Pencil className="mr-1 h-3.5 w-3.5" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={deletingId === item.id}
                              onClick={() => void deleteProvider(item)}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              {deletingId === item.id ? "Deleting..." : "Delete"}
                            </Button>
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
