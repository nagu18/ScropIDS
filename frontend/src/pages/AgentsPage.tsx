import { CircleDot, Copy, Download, KeyRound, MonitorCog, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api, errorMessage, getActiveOrgSlug } from "@/lib/api";
import { formatRelative } from "@/lib/utils";
import type { Agent, AgentArtifact, AgentArtifactManifest } from "@/types/api";

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
type UiPlatform = "mac" | "linux" | "windows";

const packagePriority: Record<AgentArtifact["platform"], AgentArtifact["package_type"][]> = {
  darwin: ["dmg", "zip", "exe", "deb"],
  linux: ["deb", "zip", "dmg", "exe"],
  windows: ["exe", "zip", "dmg", "deb"],
};

function detectPlatform(): UiPlatform {
  if (typeof navigator === "undefined") return "mac";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "mac";
}

function detectArchitecture(): AgentArtifact["architecture"] {
  if (typeof navigator === "undefined") return "amd64";
  const info = `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
  if (info.includes("arm64") || info.includes("aarch64")) return "arm64";
  return "amd64";
}

function toArtifactPlatform(platform: UiPlatform): AgentArtifact["platform"] {
  if (platform === "mac") return "darwin";
  if (platform === "windows") return "windows";
  return "linux";
}

function selectRecommendedArtifact(
  artifacts: AgentArtifact[],
  platform: UiPlatform,
  architecture: AgentArtifact["architecture"]
): AgentArtifact | null {
  const artifactPlatform = toArtifactPlatform(platform);
  const platformArtifacts = artifacts.filter((artifact) => artifact.platform === artifactPlatform);
  if (platformArtifacts.length === 0) return null;

  const archArtifacts = platformArtifacts.filter((artifact) => artifact.architecture === architecture);
  const candidates = archArtifacts.length > 0 ? archArtifacts : platformArtifacts;

  for (const packageType of packagePriority[artifactPlatform]) {
    const matched = candidates.find((artifact) => artifact.package_type === packageType);
    if (matched) return matched;
  }
  return candidates[0] ?? null;
}

type AccessTokenState = {
  organization_slug: string;
  masked_access_token: string;
  access_token?: string;
  rotated_at: string | null;
};

type AccessTokenResetResponse = {
  organization_slug: string;
  access_token: string;
  rotated_at: string | null;
};

export function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [artifacts, setArtifacts] = useState<AgentArtifact[]>([]);
  const [accessToken, setAccessToken] = useState<AccessTokenState | null>(null);
  const [rawToken, setRawToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [platform, setPlatform] = useState<UiPlatform>(() => detectPlatform());
  const navigate = useNavigate();
  const orgSlug = getActiveOrgSlug() ?? "acme-soc";
  const preferredArchitecture = useMemo(() => detectArchitecture(), []);

  const load = async () => {
    try {
      const [agentsRes, accessRes, artifactsRes] = await Promise.all([
        api.get<Agent[]>("/agents/"),
        api.get<AccessTokenState>("/agents/access-token/"),
        api.get<AgentArtifactManifest>("/agent-downloads/"),
      ]);
      setAgents(agentsRes.data);
      setAccessToken(accessRes.data);
      if (accessRes.data.access_token) {
        setRawToken(accessRes.data.access_token);
      }
      setArtifacts(artifactsRes.data.artifacts);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const rotateAccessToken = async () => {
    setRotating(true);
    try {
      const response = await api.post<AccessTokenResetResponse>("/agents/access-token/", {});
      setRawToken(response.data.access_token);
      setAccessToken({
        organization_slug: response.data.organization_slug,
        masked_access_token: "********",
        rotated_at: response.data.rotated_at,
      });
      toast.success("Agent access token reset.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRotating(false);
    }
  };

  const copyText = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied.`);
  };

  const downloadArtifact = async (artifact: AgentArtifact) => {
    setDownloading(artifact.filename);
    try {
      const normalizedPath = artifact.download_path.startsWith("/api/v1/")
        ? artifact.download_path.replace("/api/v1", "")
        : artifact.download_path;
      const response = await api.get<Blob>(normalizedPath, { responseType: "blob" });
      const url = window.URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = artifact.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded ${artifact.filename}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDownloading(null);
    }
  };

  const agentsWithStatus = useMemo(
    () =>
      agents.map((agent) => {
        const isOnline =
          !!agent.last_seen && Date.now() - new Date(agent.last_seen).getTime() <= ONLINE_THRESHOLD_MS;
        return { ...agent, isOnline };
      }),
    [agents]
  );

  const quickBinaryPath = platform === "windows" ? ".\\scropids-agent.exe" : "./scropids-agent";
  const tokenForCommand = rawToken || "<TOKEN_LOADING>";
  const quickCommand =
    platform === "windows"
      ? `${quickBinaryPath}`
      : `${quickBinaryPath}`;
  const overrideCommand =
    platform === "windows"
      ? `set SCROPIDS_API_BASE=http://localhost/api/v1 && set SCROPIDS_ORG_SLUG=${orgSlug} && set SCROPIDS_ORG_ACCESS_TOKEN=${tokenForCommand} && ${quickBinaryPath}`
      : `SCROPIDS_API_BASE="http://localhost/api/v1" SCROPIDS_ORG_SLUG="${orgSlug}" SCROPIDS_ORG_ACCESS_TOKEN="${tokenForCommand}" ${quickBinaryPath}`;
  const recommendedArtifact = useMemo(
    () => selectRecommendedArtifact(artifacts, platform, preferredArchitecture),
    [artifacts, platform, preferredArchitecture]
  );

  const bytesLabel = (size: number): string => {
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${size} B`;
  };

  const platformLabel = (value: AgentArtifact["platform"]): string => {
    if (value === "darwin") return "macOS";
    if (value === "windows") return "Windows";
    return "Linux";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agents"
        subtitle="Simple flow: reset org token, download agent, run one command."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-accent" />
              Organization Agent Access Token
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <Skeleton className="h-28" />
            ) : (
              <>
                <div className="rounded-md border border-border bg-background p-3">
                  <p className="text-xs uppercase text-muted">Organization</p>
                  <p className="text-sm">{orgSlug}</p>
                </div>
                <div className="rounded-md border border-border bg-background p-3">
                  <p className="text-xs uppercase text-muted">Current token</p>
                  <p className="text-sm">{accessToken?.masked_access_token || "not set"}</p>
                  <p className="mt-1 text-xs text-muted">
                    Rotated: {accessToken?.rotated_at ? new Date(accessToken.rotated_at).toLocaleString() : "never"}
                  </p>
                </div>
                <Button variant="outline" onClick={() => void rotateAccessToken()} disabled={rotating}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  {rotating ? "Resetting..." : "Reset Token"}
                </Button>
                {rawToken ? (
                  <div className="rounded-md border border-primary/30 bg-primary/10 p-3">
                    <p className="text-xs uppercase text-muted">New token (copy now)</p>
                    <p className="mt-1 break-all font-mono text-sm">{rawToken}</p>
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => void copyText(rawToken, "Access token")}>
                      <Copy className="mr-2 h-3.5 w-3.5" />
                      Copy
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Run Command</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={platform === "mac" ? "default" : "outline"} onClick={() => setPlatform("mac")}>
                macOS
              </Button>
              <Button size="sm" variant={platform === "linux" ? "default" : "outline"} onClick={() => setPlatform("linux")}>
                Linux
              </Button>
              <Button size="sm" variant={platform === "windows" ? "default" : "outline"} onClick={() => setPlatform("windows")}>
                Windows
              </Button>
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs uppercase text-muted">One command (preconfigured)</p>
              <p className="mt-1 break-all font-mono text-sm">{quickCommand}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => void copyText(quickCommand, "Run command")}>
                <Copy className="mr-2 h-3.5 w-3.5" />
                Copy
              </Button>
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs uppercase text-muted">Optional override command</p>
              <p className="mt-1 break-all font-mono text-sm">{overrideCommand}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => void copyText(overrideCommand, "Override command")}>
                <Copy className="mr-2 h-3.5 w-3.5" />
                Copy Override
              </Button>
            </div>
            <Button
              size="sm"
              disabled={!recommendedArtifact || downloading !== null}
              onClick={() => {
                if (recommendedArtifact) {
                  void downloadArtifact(recommendedArtifact);
                }
              }}
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              {downloading === recommendedArtifact?.filename ? "Downloading..." : "Download Recommended Agent"}
            </Button>
            {recommendedArtifact ? (
              <p className="text-xs text-muted">
                Auto-selected: {recommendedArtifact.filename} ({recommendedArtifact.architecture})
              </p>
            ) : null}
            <p className="text-xs text-muted">
              Tip: downloaded agent is preconfigured with org slug and access token. Install, run, set device name, and it auto-registers.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-4 w-4 text-accent" />
            Download Agents
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-44" />
          ) : artifacts.length === 0 ? (
            <EmptyState icon={Download} title="No Agent Packages" description="Build agent artifacts to enable downloads." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Platform</TH>
                    <TH>Architecture</TH>
                    <TH>Package</TH>
                    <TH>File</TH>
                    <TH>Size</TH>
                    <TH>Download</TH>
                  </TR>
                </THead>
                <TBody>
                  {artifacts.map((artifact) => (
                    <TR key={artifact.filename}>
                      <TD>{platformLabel(artifact.platform)}</TD>
                      <TD>{artifact.architecture}</TD>
                      <TD>{artifact.package_type.toUpperCase()}</TD>
                      <TD className="font-mono text-xs">{artifact.filename}</TD>
                      <TD>{bytesLabel(artifact.size_bytes)}</TD>
                      <TD>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={downloading === artifact.filename}
                          onClick={() => void downloadArtifact(artifact)}
                        >
                          <Download className="mr-2 h-3.5 w-3.5" />
                          {downloading === artifact.filename ? "Downloading..." : "Download"}
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MonitorCog className="h-4 w-4 text-accent" />
              Enrolled Endpoints
            </CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          {loading ? (
            <Skeleton className="h-[260px]" />
          ) : agentsWithStatus.length === 0 ? (
            <EmptyState icon={MonitorCog} title="No Endpoints Yet" description="Deploy an agent with the command above." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Hostname</TH>
                    <TH>OS</TH>
                    <TH>Last Heartbeat</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {agentsWithStatus.map((agent) => (
                    <TR key={agent.id} className="cursor-pointer" onClick={() => navigate(`/agents/${agent.id}`)}>
                      <TD>{agent.hostname}</TD>
                      <TD className="capitalize">{agent.operating_system}</TD>
                      <TD>{formatRelative(agent.last_seen)}</TD>
                      <TD>
                        <Badge
                          className={
                            agent.isOnline
                              ? "border-safe/60 bg-safe/20 text-safe"
                              : "border-danger/60 bg-danger/20 text-danger"
                          }
                        >
                          <CircleDot className="mr-1 h-3 w-3" />
                          {agent.isOnline ? "Online" : "Offline"}
                        </Badge>
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
  );
}
