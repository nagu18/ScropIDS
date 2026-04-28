import axios from "axios";
import { CircleDot, Copy, Download, KeyRound, MonitorCog, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { agentApiBaseUrl, api, browserDownloadUrl, errorMessage, getActiveOrgSlug } from "@/lib/api";
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

const ADMIN_ROLES = new Set(["owner", "admin"]);

export function AgentsPage() {
  const { me, activeOrgSlug } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [artifacts, setArtifacts] = useState<AgentArtifact[]>([]);
  const [accessToken, setAccessToken] = useState<AccessTokenState | null>(null);
  const [rawToken, setRawToken] = useState("");
  const [tokenAccessBlocked, setTokenAccessBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [platform, setPlatform] = useState<UiPlatform>(() => detectPlatform());
  const navigate = useNavigate();
  const preferredArchitecture = useMemo(() => detectArchitecture(), []);
  const activeOrg =
    me?.organizations.find((organization) => organization.slug === activeOrgSlug) ?? me?.organizations[0] ?? null;
  const orgSlug = activeOrg?.slug ?? getActiveOrgSlug() ?? "";
  const canManageTenantAgents = activeOrg ? ADMIN_ROLES.has(activeOrg.role ?? "") : false;
  const apiBaseForCommand = agentApiBaseUrl();

  const load = async () => {
    try {
      const [agentsRes, artifactsRes] = await Promise.all([
        api.get<Agent[]>("/agents/"),
        api.get<AgentArtifactManifest>("/agent-downloads/"),
      ]);
      setAgents(agentsRes.data);
      setArtifacts(artifactsRes.data.artifacts);
      setAccessToken(null);
      setRawToken("");

      if (!canManageTenantAgents) {
        setTokenAccessBlocked(true);
        return;
      }

      try {
        const accessRes = await api.get<AccessTokenState>("/agents/access-token/");
        setAccessToken(accessRes.data);
        if (accessRes.data.access_token) {
          setRawToken(accessRes.data.access_token);
        }
        setTokenAccessBlocked(false);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 403) {
          setTokenAccessBlocked(true);
          return;
        }
        toast.error(errorMessage(error));
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [canManageTenantAgents]);

  const rotateAccessToken = async () => {
    if (!canManageTenantAgents) {
      toast.error("Only tenant owners or admins can reset the organization access token.");
      return;
    }
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

  const downloadArtifact = (artifact: AgentArtifact) => {
    setDownloading(artifact.filename);
    try {
      const url = browserDownloadUrl(artifact.download_path);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = artifact.filename;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      toast.success(`Started download for ${artifact.filename}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      window.setTimeout(() => setDownloading(null), 250);
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
  const tokenForCommand = tokenAccessBlocked ? "<OWNER_OR_ADMIN_REQUIRED>" : rawToken || "<TOKEN_LOADING>";
  const quickCommand =
    platform === "windows"
      ? `set SCROPIDS_API_BASE=${apiBaseForCommand} && set SCROPIDS_ORG_SLUG=${orgSlug} && set SCROPIDS_ORG_ACCESS_TOKEN=${tokenForCommand} && ${quickBinaryPath}`
      : `SCROPIDS_API_BASE="${apiBaseForCommand}" SCROPIDS_ORG_SLUG="${orgSlug}" SCROPIDS_ORG_ACCESS_TOKEN="${tokenForCommand}" ${quickBinaryPath}`;
  const setupCommand = `${quickBinaryPath} --setup`;
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
        subtitle="Simple flow: reset org token, download agent, then run the generated command."
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
            ) : tokenAccessBlocked ? (
              <>
                <div className="rounded-md border border-border bg-background p-3">
                  <p className="text-xs uppercase text-muted">Organization</p>
                  <p className="text-sm">{orgSlug || "No tenant selected"}</p>
                </div>
                <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                  Tenant owner or admin access is required to view or reset the organization agent token.
                </div>
                <p className="text-xs text-muted">
                  Current role: <span className="font-medium">{activeOrg?.role ?? "unknown"}</span>. Ask an owner/admin to
                  reset the token and share the install command if needed.
                </p>
              </>
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
              <p className="text-xs uppercase text-muted">One command (recommended)</p>
              <p className="mt-1 break-all font-mono text-sm">{quickCommand}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => void copyText(quickCommand, "Run command")}>
                <Copy className="mr-2 h-3.5 w-3.5" />
                Copy
              </Button>
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs uppercase text-muted">Interactive setup</p>
              <p className="mt-1 break-all font-mono text-sm">{setupCommand}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => void copyText(setupCommand, "Setup command")}>
                <Copy className="mr-2 h-3.5 w-3.5" />
                Copy Setup
              </Button>
            </div>
            {tokenAccessBlocked ? (
              <p className="text-xs text-muted">
                This command needs the organization token, so only a tenant owner/admin can provide the fully populated version.
              </p>
            ) : null}
            <Button
              size="sm"
              disabled={!recommendedArtifact || downloading !== null}
              onClick={() => {
                if (recommendedArtifact) {
                  downloadArtifact(recommendedArtifact);
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
              Tip: the download is a generic agent package. Use the copied command above or run interactive setup to connect it to this workspace.
            </p>
            <p className="text-xs text-muted">
              If you already launched an older agent build, running it again will try to re-enroll automatically. If the saved token is stale, the setup wizard will reopen in the terminal.
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
                          onClick={() => downloadArtifact(artifact)}
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
