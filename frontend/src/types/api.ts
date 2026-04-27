export type Organization = {
  id: string;
  name: string;
  slug: string;
  role?: string;
};

export type DashboardOverview = {
  organization: Organization;
  totals: {
    agents: number;
    events_24h: number;
    active_alerts: number;
    aggregates_pending_llm: number;
  };
  threat_distribution: Array<{ threat_level: string; count: number }>;
  confidence_heatmap: Array<{ agent__hostname: string; avg_confidence: number; count: number }>;
  generated_at: string;
};

export type Agent = {
  id: string;
  organization_slug: string;
  hostname: string;
  operating_system: string;
  ip_address: string | null;
  last_seen: string | null;
  created_at: string;
};

export type Alert = {
  id: number;
  agent: Agent | null;
  threat_level: string;
  confidence: number;
  status: "open" | "in_progress" | "resolved";
  llm_analysis: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type SchedulerConfig = {
  id: number;
  organization_slug: string;
  name: string;
  is_active: boolean;
  aggregation_interval: number;
  llm_mode: "realtime" | "batch";
  min_severity: "low" | "medium" | "high" | "critical";
  alert_threshold: "low" | "medium" | "high" | "critical";
  agent_sync_interval: number;
  agent_event_interval: number;
  collect_system_logs: boolean;
  collect_security_logs: boolean;
  collect_network_activity: boolean;
  collect_process_activity: boolean;
  collect_file_changes: boolean;
  require_elevated_permissions: boolean;
  rule_engine_enabled: boolean;
  rule_pack_source_url: string;
  rule_config_json: Record<string, unknown>;
  agent_profile_notes: string;
  last_aggregation_run: string | null;
  updated_at: string;
};

export type LlmProvider = {
  id: number;
  organization_slug: string;
  name: string;
  provider_type: "openai_compatible" | "ollama";
  base_url: string;
  model: string;
  timeout_seconds: number;
  is_active: boolean;
  masked_api_key: string;
  created_at: string;
  updated_at: string;
};

export type EnrollmentToken = {
  id: number;
  organization_slug: string;
  description: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
  enrollment_token?: string;
};

export type AgentTimeline = {
  agent: {
    id: string;
    hostname: string;
    operating_system: string;
    last_seen: string | null;
  };
  events: Array<{
    id: number;
    timestamp: string;
    ingested_at: string;
    event_type: string;
    severity: string;
    data: Record<string, unknown>;
  }>;
  llm_insights: Array<{
    aggregate_id: number;
    window_start: string;
    window_end: string;
    created_at: string;
    threat_level: string | null;
    confidence: number | null;
    reasoning: string | null;
    recommended_action: string | null;
  }>;
};

export type AuthMe = {
  id: number;
  username: string;
  is_staff: boolean;
  organizations: Organization[];
};

export type AgentArtifact = {
  filename: string;
  platform: "linux" | "windows" | "darwin";
  architecture: "amd64" | "arm64";
  package_type: "zip" | "deb" | "dmg" | "exe";
  size_bytes: number;
  sha256: string;
  download_path: string;
};

export type AgentArtifactManifest = {
  artifacts: AgentArtifact[];
};
