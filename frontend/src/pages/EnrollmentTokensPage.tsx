import { Copy, Download, PlusCircle, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import type { AgentArtifact, AgentArtifactManifest } from "@/types/api";

type BootstrapResponse = {
  agent_id: string;
  agent_token: string;
  organization_slug: string;
  hostname: string;
  operating_system: string;
  ip_address?: string | null;
  created_at: string;
};

export function EnrollmentTokensPage() {
  const [artifacts, setArtifacts] = useState<AgentArtifact[]>([]);
  const [loadingArtifacts, setLoadingArtifacts] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [platform, setPlatform] = useState<"mac" | "linux" | "windows">("mac");
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);

  const [hostname, setHostname] = useState("endpoint-01");
  const [operatingSystem, setOperatingSystem] = useState("macos");
  const [ipAddress, setIpAddress] = useState("");

  const loadArtifacts = async () => {
    try {
      const response = await api.get<AgentArtifactManifest>("/agent-downloads/");
      setArtifacts(response.data.artifacts);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoadingArtifacts(false);
    }
  };

  useEffect(() => {
    void loadArtifacts();
  }, []);

  const createCredentials = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      const response = await api.post<BootstrapResponse>("/agents/bootstrap/", {
        hostname,
        operating_system: operatingSystem,
        ip_address: ipAddress || null,
      });
      setBootstrap(response.data);
      toast.success("Agent credentials created.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCreating(false);
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

  const quickBinaryPath = useMemo(() => {
    if (platform === "windows") return ".\\scropids-agent.exe";
    return "./scropids-agent";
  }, [platform]);

  const interactiveCommand = `${quickBinaryPath} --setup`;

  const credentialCommand = useMemo(() => {
    if (!bootstrap) return "";
    if (platform === "windows") {
      return `set SCROPIDS_API_BASE=http://localhost/api/v1 && set SCROPIDS_AGENT_ID=${bootstrap.agent_id} && set SCROPIDS_AGENT_TOKEN=${bootstrap.agent_token} && ${quickBinaryPath}`;
    }
    return `SCROPIDS_API_BASE="http://localhost/api/v1" SCROPIDS_AGENT_ID="${bootstrap.agent_id}" SCROPIDS_AGENT_TOKEN="${bootstrap.agent_token}" ${quickBinaryPath}`;
  }, [bootstrap, platform, quickBinaryPath]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent Setup"
        subtitle="Simple onboarding: create credentials, download package, run interactive setup."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4 text-accent" />
              Create Agent Credentials
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={createCredentials}>
              <Input placeholder="Hostname" value={hostname} onChange={(event) => setHostname(event.target.value)} required />
              <Select value={operatingSystem} onValueChange={setOperatingSystem}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="macos">macOS</SelectItem>
                  <SelectItem value="linux">Linux</SelectItem>
                  <SelectItem value="windows">Windows</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="IP address (optional)"
                value={ipAddress}
                onChange={(event) => setIpAddress(event.target.value)}
              />
              <Button type="submit" disabled={creating}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                {creating ? "Creating..." : "Create Credentials"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Generated Credentials</CardTitle>
          </CardHeader>
          <CardContent>
            {!bootstrap ? (
              <EmptyState
                icon={ShieldCheck}
                title="No Credentials Yet"
                description="Create agent credentials to start endpoint setup."
              />
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border border-border bg-background p-3">
                  <p className="text-xs uppercase text-muted">Agent ID</p>
                  <p className="mt-1 break-all font-mono text-sm">{bootstrap.agent_id}</p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => void copyText(bootstrap.agent_id, "Agent ID")}>
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    Copy
                  </Button>
                </div>
                <div className="rounded-md border border-border bg-background p-3">
                  <p className="text-xs uppercase text-muted">Agent Token</p>
                  <p className="mt-1 break-all font-mono text-sm">{bootstrap.agent_token}</p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => void copyText(bootstrap.agent_token, "Agent token")}>
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    Copy
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Simple Run Commands</CardTitle>
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
            <p className="text-xs uppercase text-muted">Interactive wizard (recommended)</p>
            <p className="mt-1 font-mono text-sm">{interactiveCommand}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => void copyText(interactiveCommand, "Interactive command")}>
              <Copy className="mr-2 h-3.5 w-3.5" />
              Copy
            </Button>
          </div>

          {bootstrap ? (
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs uppercase text-muted">Credential command (one line)</p>
              <p className="mt-1 break-all font-mono text-sm">{credentialCommand}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => void copyText(credentialCommand, "Credential command")}>
                <Copy className="mr-2 h-3.5 w-3.5" />
                Copy
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-4 w-4 text-accent" />
            Agent Downloads (Windows / Linux / macOS)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingArtifacts ? (
            <div className="h-44 animate-pulse rounded bg-slate-700/20" />
          ) : artifacts.length === 0 ? (
            <EmptyState
              icon={Download}
              title="No Agent Artifacts"
              description="Build artifacts first, then downloads will appear here for all platforms."
            />
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
                    <TH>SHA256</TH>
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
                      <TD className="font-mono text-xs">{artifact.sha256.slice(0, 16)}...</TD>
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
    </div>
  );
}
