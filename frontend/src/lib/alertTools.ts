import type { Alert } from "@/types/api";

export type AlertSoundScope = "off" | "all" | "critical" | "high" | "medium" | "low";
export type AlertSoundEffect = "pulse" | "siren" | "beacon";

export type AlertSoundConfig = {
  enabled: boolean;
  scope: AlertSoundScope;
  effect: AlertSoundEffect;
  volume: number;
};

export type MitigationReference = {
  label: string;
  url: string;
  description: string;
};

const ALERT_SOUND_CONFIG_KEY = "scropids.alert.sound.config.v1";

const DEFAULT_SOUND_CONFIG: AlertSoundConfig = {
  enabled: true,
  scope: "high",
  effect: "pulse",
  volume: 0.35,
};

const severityRank: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function loadAlertSoundConfig(): AlertSoundConfig {
  if (typeof window === "undefined") return DEFAULT_SOUND_CONFIG;
  try {
    const raw = window.localStorage.getItem(ALERT_SOUND_CONFIG_KEY);
    if (!raw) return DEFAULT_SOUND_CONFIG;
    const parsed = JSON.parse(raw) as Partial<AlertSoundConfig>;
    return {
      enabled: parsed.enabled ?? DEFAULT_SOUND_CONFIG.enabled,
      scope: parsed.scope ?? DEFAULT_SOUND_CONFIG.scope,
      effect: parsed.effect ?? DEFAULT_SOUND_CONFIG.effect,
      volume: typeof parsed.volume === "number" ? Math.max(0, Math.min(1, parsed.volume)) : DEFAULT_SOUND_CONFIG.volume,
    };
  } catch {
    return DEFAULT_SOUND_CONFIG;
  }
}

export function saveAlertSoundConfig(config: AlertSoundConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ALERT_SOUND_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Best effort only.
  }
}

export function matchesSoundScope(severity: string, scope: AlertSoundScope): boolean {
  const normalized = severity.toLowerCase();
  if (scope === "off") return false;
  if (scope === "all") return true;
  return normalized === scope;
}

export function pickMostSevereMatchingAlert(alerts: Alert[], config: AlertSoundConfig): Alert | null {
  if (!config.enabled || config.scope === "off" || alerts.length === 0) return null;
  const matching = alerts.filter((alert) => matchesSoundScope(alert.threat_level, config.scope));
  if (matching.length === 0) return null;
  return matching.sort((a, b) => (severityRank[b.threat_level] ?? 0) - (severityRank[a.threat_level] ?? 0))[0];
}

export async function playAlertSound(severity: string, effect: AlertSoundEffect, volume: number): Promise<void> {
  if (typeof window === "undefined") return;
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;

  const context = new AudioContextCtor();
  if (context.state === "suspended") {
    await context.resume();
  }

  const now = context.currentTime;
  const gain = Math.max(0, Math.min(1, volume));
  const normalized = severity.toLowerCase();

  const baseFrequency = normalized === "critical" ? 880 : normalized === "high" ? 760 : normalized === "medium" ? 640 : 520;

  const tone = (startAt: number, frequency: number, duration: number, gainValue: number) => {
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, startAt);
    amp.gain.setValueAtTime(0.0001, startAt);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.001, gainValue), startAt + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.connect(amp);
    amp.connect(context.destination);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.02);
  };

  if (effect === "siren") {
    tone(now, baseFrequency, 0.18, gain);
    tone(now + 0.2, baseFrequency + 180, 0.18, gain * 0.95);
    tone(now + 0.4, baseFrequency, 0.2, gain);
  } else if (effect === "beacon") {
    tone(now, baseFrequency, 0.14, gain);
    tone(now + 0.25, baseFrequency * 0.8, 0.22, gain * 0.85);
  } else {
    tone(now, baseFrequency, 0.09, gain);
    tone(now + 0.12, baseFrequency, 0.09, gain * 0.9);
    tone(now + 0.24, baseFrequency, 0.09, gain * 0.8);
  }

  window.setTimeout(() => {
    void context.close();
  }, 1200);
}

export function buildMitigationReferences(alert: Alert): MitigationReference[] {
  const threat = alert.threat_level;
  const host = alert.agent?.hostname ?? "endpoint";
  const reasoning = String(alert.llm_analysis.reasoning ?? "").trim();
  const action = String(alert.llm_analysis.recommended_action ?? "").trim();
  const query = [threat, host, reasoning, action, "cyber incident mitigation"].filter(Boolean).join(" ");
  const docsQuery = [threat, reasoning, "incident response playbook pdf"].filter(Boolean).join(" ");

  return [
    {
      label: "Google Mitigation Search",
      url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      description: "Find remediation guides and practical steps from current web results.",
    },
    {
      label: "Web Search (DuckDuckGo)",
      url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
      description: "Alternative internet search focused on incident writeups and analyst notes.",
    },
    {
      label: "YouTube Investigation Walkthroughs",
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      description: "Video walkthroughs for containment, investigation, and recovery.",
    },
    {
      label: "MITRE ATT&CK",
      url: "https://attack.mitre.org/",
      description: "Map behaviors to techniques and review mitigations and detections.",
    },
    {
      label: "CISA Cybersecurity Advisories",
      url: "https://www.cisa.gov/news-events/cybersecurity-advisories",
      description: "Official threat advisories and remediation recommendations.",
    },
    {
      label: "OWASP Cheat Sheet Series",
      url: "https://cheatsheetseries.owasp.org/",
      description: "Actionable hardening and response references for common attack paths.",
    },
    {
      label: "NIST SP 800-61",
      url: "https://csrc.nist.gov/publications/detail/sp/800-61/rev-2/final",
      description: "Incident handling lifecycle reference and communication process.",
    },
    {
      label: "Docs Search (PDF/Guides)",
      url: `https://www.google.com/search?q=${encodeURIComponent(docsQuery)}`,
      description: "Directly search for technical docs, runbooks, and PDF playbooks.",
    },
  ];
}
