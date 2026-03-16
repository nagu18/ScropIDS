package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type Event struct {
	Timestamp string                 `json:"timestamp"`
	EventType string                 `json:"event_type"`
	Severity  string                 `json:"severity"`
	Data      map[string]interface{} `json:"data"`
}

type EventBatch struct {
	Events []Event `json:"events"`
}

type EnrollmentRequest struct {
	OrganizationSlug string `json:"organization_slug"`
	EnrollmentToken  string `json:"enrollment_token"`
	Hostname         string `json:"hostname"`
	OperatingSystem  string `json:"operating_system"`
	IPAddress        string `json:"ip_address,omitempty"`
}

type EnrollmentResponse struct {
	AgentID          string `json:"agent_id"`
	AgentToken       string `json:"agent_token"`
	OrganizationSlug string `json:"organization_slug"`
}

type QuickEnrollRequest struct {
	OrganizationSlug string `json:"organization_slug"`
	AccessToken      string `json:"access_token"`
	Hostname         string `json:"hostname"`
	OperatingSystem  string `json:"operating_system"`
	IPAddress        string `json:"ip_address,omitempty"`
}

type RuntimeConfigResponse struct {
	Scheduler RuntimeScheduler `json:"scheduler"`
}

type RuntimeScheduler struct {
	Name               string            `json:"name"`
	IsActive           bool              `json:"is_active"`
	AgentSyncInterval  int               `json:"agent_sync_interval"`
	AgentEventInterval int               `json:"agent_event_interval"`
	Collectors         CollectorSettings `json:"collectors"`
	Permissions        PermissionConfig  `json:"permissions"`
	Notes              string            `json:"notes"`
	UpdatedAt          string            `json:"updated_at"`
}

type CollectorSettings struct {
	SystemLogs      bool `json:"system_logs"`
	SecurityLogs    bool `json:"security_logs"`
	NetworkActivity bool `json:"network_activity"`
	ProcessActivity bool `json:"process_activity"`
	FileChanges     bool `json:"file_changes"`
}

type PermissionConfig struct {
	RequireElevatedPermissions bool `json:"require_elevated_permissions"`
}

type AgentRuntime struct {
	EventInterval time.Duration
	SyncInterval  time.Duration
	Collectors    CollectorSettings
	Permissions   PermissionConfig
	Notes         string
}

type commandResult struct {
	Command string
	Output  []string
}

type AgentConfig struct {
	APIBase          string `json:"api_base"`
	AgentID          string `json:"agent_id"`
	AgentToken       string `json:"agent_token"`
	OrganizationSlug string `json:"organization_slug,omitempty"`
	OrgAccessToken   string `json:"org_access_token,omitempty"`
	Hostname         string `json:"hostname,omitempty"`
	IPAddress        string `json:"ip_address,omitempty"`
}

const (
	defaultAPIBase        = "http://localhost/api/v1"
	defaultOrgSlug        = "acme-soc"
	defaultOrgAccessToken = "AB_VqW0C8BWd-I7nlTNjlAu02VOFB47s3C7f1nLyydO2WmDwMUL0M4NbHVtnHTPb"
)

func main() {
	setupFlag := flag.Bool("setup", false, "Run interactive setup wizard")
	flag.Parse()

	printBanner()

	cfg, _ := loadConfig()
	cfg = mergeConfigWithEnv(cfg)

	if *setupFlag || getenvBool("SCROPIDS_SETUP", false) {
		nextCfg, err := setupWizard(cfg)
		if err != nil {
			log.Fatalf("setup failed: %v", err)
		}
		cfg = nextCfg
		if err := saveConfig(cfg); err != nil {
			log.Printf("warning: unable to save config: %v", err)
		}
	}

	if cfg.AgentID == "" || cfg.AgentToken == "" {
		orgSlug := firstNonEmpty(os.Getenv("SCROPIDS_ORG_SLUG"), cfg.OrganizationSlug, defaultOrgSlug)
		orgAccessToken := firstNonEmpty(os.Getenv("SCROPIDS_ORG_ACCESS_TOKEN"), cfg.OrgAccessToken, defaultOrgAccessToken)
		enrollmentToken := os.Getenv("SCROPIDS_ENROLLMENT_TOKEN")
		hostname := firstNonEmpty(os.Getenv("SCROPIDS_HOSTNAME"), cfg.Hostname, hostOrFallback())
		ipAddress := firstNonEmpty(os.Getenv("SCROPIDS_IP_ADDRESS"), cfg.IPAddress)

		if orgSlug != "" && orgAccessToken != "" {
			enrollResp, err := quickEnrollAgent(cfg.APIBase, QuickEnrollRequest{
				OrganizationSlug: orgSlug,
				AccessToken:      orgAccessToken,
				Hostname:         hostname,
				OperatingSystem:  runtime.GOOS,
				IPAddress:        ipAddress,
			})
			if err != nil {
				log.Fatalf("quick enroll failed: %v", err)
			}
			cfg.AgentID = enrollResp.AgentID
			cfg.AgentToken = enrollResp.AgentToken
			cfg.OrganizationSlug = enrollResp.OrganizationSlug
			cfg.OrgAccessToken = orgAccessToken
			cfg.Hostname = hostname
			cfg.IPAddress = ipAddress
			if err := saveConfig(cfg); err != nil {
				log.Printf("warning: unable to save config: %v", err)
			}
			log.Printf("Quick enroll complete for tenant=%s agent_id=%s", enrollResp.OrganizationSlug, cfg.AgentID)
		} else if orgSlug != "" && enrollmentToken != "" {
			enrollResp, err := enrollAgent(cfg.APIBase, EnrollmentRequest{
				OrganizationSlug: orgSlug,
				EnrollmentToken:  enrollmentToken,
				Hostname:         hostname,
				OperatingSystem:  runtime.GOOS,
				IPAddress:        ipAddress,
			})
			if err != nil {
				log.Fatalf("agent enrollment failed: %v", err)
			}
			cfg.AgentID = enrollResp.AgentID
			cfg.AgentToken = enrollResp.AgentToken
			cfg.OrganizationSlug = enrollResp.OrganizationSlug
			cfg.Hostname = hostname
			cfg.IPAddress = ipAddress
			if err := saveConfig(cfg); err != nil {
				log.Printf("warning: unable to save config: %v", err)
			}
			log.Printf("Enrollment complete for tenant=%s agent_id=%s", enrollResp.OrganizationSlug, cfg.AgentID)
		} else if isInteractiveShell() {
			nextCfg, err := setupWizard(cfg)
			if err != nil {
				log.Fatalf("setup failed: %v", err)
			}
			cfg = nextCfg
			if err := saveConfig(cfg); err != nil {
				log.Printf("warning: unable to save config: %v", err)
			}
		} else {
			log.Fatal("set credentials or run with --setup to configure interactively")
		}
	}

	runtimeCfg := loadLocalRuntimeDefaults()
	if remoteCfg, err := fetchRuntimeConfig(cfg.APIBase, cfg.AgentID, cfg.AgentToken); err == nil {
		runtimeCfg = remoteCfg
		log.Printf(
			"Loaded scheduler profile from server: event_interval=%s sync_interval=%s",
			runtimeCfg.EventInterval,
			runtimeCfg.SyncInterval,
		)
	} else {
		log.Printf("runtime config fetch failed, using local defaults: %v", err)
	}

	sendTicker := time.NewTicker(runtimeCfg.EventInterval)
	syncTicker := time.NewTicker(runtimeCfg.SyncInterval)
	defer sendTicker.Stop()
	defer syncTicker.Stop()

	sendConfiguredEvents(cfg.APIBase, cfg.AgentID, cfg.AgentToken, runtimeCfg)
	sendHeartbeat(cfg.APIBase, cfg.AgentID, cfg.AgentToken)

	for {
		select {
		case <-sendTicker.C:
			sendConfiguredEvents(cfg.APIBase, cfg.AgentID, cfg.AgentToken, runtimeCfg)
			sendHeartbeat(cfg.APIBase, cfg.AgentID, cfg.AgentToken)
		case <-syncTicker.C:
			nextCfg, err := fetchRuntimeConfig(cfg.APIBase, cfg.AgentID, cfg.AgentToken)
			if err != nil {
				log.Printf("runtime config refresh failed: %v", err)
				continue
			}
			if nextCfg.EventInterval != runtimeCfg.EventInterval {
				sendTicker.Reset(nextCfg.EventInterval)
				log.Printf("updated event interval from server: %s", nextCfg.EventInterval)
			}
			if nextCfg.SyncInterval != runtimeCfg.SyncInterval {
				syncTicker.Reset(nextCfg.SyncInterval)
				log.Printf("updated sync interval from server: %s", nextCfg.SyncInterval)
			}
			runtimeCfg = nextCfg
		}
	}
}

func setupWizard(existing AgentConfig) (AgentConfig, error) {
	if !isInteractiveShell() {
		return existing, fmt.Errorf("interactive setup requires terminal input")
	}

	reader := bufio.NewReader(os.Stdin)
	fmt.Println("Setup Wizard - configure ScropIDS Agent")
	fmt.Println("1) Use organization access token (recommended)")
	fmt.Println("2) Use agent credentials")
	fmt.Println("3) Legacy enrollment token mode")
	mode := prompt(reader, "Select mode (1/2/3)", "1")

	cfg := existing
	cfg.APIBase = prompt(reader, "API base URL", firstNonEmpty(cfg.APIBase, defaultAPIBase))

	switch strings.TrimSpace(mode) {
	case "1":
		orgSlug := prompt(reader, "Organization slug", firstNonEmpty(cfg.OrganizationSlug, defaultOrgSlug))
		orgAccessToken := prompt(reader, "Organization access token", firstNonEmpty(cfg.OrgAccessToken, defaultOrgAccessToken))
		hostname := prompt(reader, "Hostname", firstNonEmpty(cfg.Hostname, hostOrFallback()))
		ipAddress := prompt(reader, "IP address (optional)", cfg.IPAddress)
		if orgSlug == "" || orgAccessToken == "" {
			return cfg, fmt.Errorf("organization slug and access token are required")
		}
		enrollResp, err := quickEnrollAgent(cfg.APIBase, QuickEnrollRequest{
			OrganizationSlug: orgSlug,
			AccessToken:      orgAccessToken,
			Hostname:         hostname,
			OperatingSystem:  runtime.GOOS,
			IPAddress:        ipAddress,
		})
		if err != nil {
			return cfg, err
		}
		cfg.AgentID = enrollResp.AgentID
		cfg.AgentToken = enrollResp.AgentToken
		cfg.OrganizationSlug = enrollResp.OrganizationSlug
		cfg.OrgAccessToken = orgAccessToken
		cfg.Hostname = hostname
		cfg.IPAddress = ipAddress
		fmt.Printf("Quick enroll complete: %s\n", enrollResp.AgentID)
		return cfg, nil
	case "2":
		cfg.AgentID = prompt(reader, "Agent ID", cfg.AgentID)
		cfg.AgentToken = prompt(reader, "Agent Token", cfg.AgentToken)
		if cfg.AgentID == "" || cfg.AgentToken == "" {
			return cfg, fmt.Errorf("agent id/token are required")
		}
		fmt.Println("Credentials saved.")
		return cfg, nil
	case "3":
		orgSlug := prompt(reader, "Organization slug", firstNonEmpty(cfg.OrganizationSlug, defaultOrgSlug))
		enrollmentToken := prompt(reader, "Enrollment token", "")
		hostname := prompt(reader, "Hostname", firstNonEmpty(cfg.Hostname, hostOrFallback()))
		ipAddress := prompt(reader, "IP address (optional)", cfg.IPAddress)
		if enrollmentToken == "" {
			return cfg, fmt.Errorf("enrollment token is required")
		}

		enrollResp, err := enrollAgent(cfg.APIBase, EnrollmentRequest{
			OrganizationSlug: orgSlug,
			EnrollmentToken:  enrollmentToken,
			Hostname:         hostname,
			OperatingSystem:  runtime.GOOS,
			IPAddress:        ipAddress,
		})
		if err != nil {
			return cfg, err
		}
		cfg.AgentID = enrollResp.AgentID
		cfg.AgentToken = enrollResp.AgentToken
		cfg.OrganizationSlug = enrollResp.OrganizationSlug
		cfg.Hostname = hostname
		cfg.IPAddress = ipAddress
		fmt.Printf("Enrollment complete: %s\n", enrollResp.AgentID)
		return cfg, nil
	default:
		return cfg, fmt.Errorf("invalid setup option")
	}
}

func loadLocalRuntimeDefaults() AgentRuntime {
	eventInterval := parseDurationWithFallback(
		getenv("SCROPIDS_EVENT_INTERVAL", getenv("SCROPIDS_INTERVAL", "15s")),
		15*time.Second,
	)
	syncInterval := parseDurationWithFallback(getenv("SCROPIDS_SYNC_INTERVAL", "60s"), 60*time.Second)
	return AgentRuntime{
		EventInterval: eventInterval,
		SyncInterval:  syncInterval,
		Collectors: CollectorSettings{
			SystemLogs:      getenvBool("SCROPIDS_COLLECT_SYSTEM_LOGS", true),
			SecurityLogs:    getenvBool("SCROPIDS_COLLECT_SECURITY_LOGS", true),
			NetworkActivity: getenvBool("SCROPIDS_COLLECT_NETWORK_ACTIVITY", true),
			ProcessActivity: getenvBool("SCROPIDS_COLLECT_PROCESS_ACTIVITY", true),
			FileChanges:     getenvBool("SCROPIDS_COLLECT_FILE_CHANGES", false),
		},
		Permissions: PermissionConfig{
			RequireElevatedPermissions: getenvBool("SCROPIDS_REQUIRE_ELEVATED_PERMISSIONS", false),
		},
		Notes: "",
	}
}

func fetchRuntimeConfig(apiBase, agentID, agentToken string) (AgentRuntime, error) {
	req, err := http.NewRequest(http.MethodGet, strings.TrimRight(apiBase, "/")+"/ingest/config/", nil)
	if err != nil {
		return AgentRuntime{}, err
	}
	req.Header.Set("X-Agent-ID", agentID)
	req.Header.Set("X-Agent-Token", agentToken)

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return AgentRuntime{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return AgentRuntime{}, readHTTPError(resp, "fetch runtime config")
	}

	var payload RuntimeConfigResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return AgentRuntime{}, err
	}
	return AgentRuntime{
		EventInterval: time.Duration(maxInt(payload.Scheduler.AgentEventInterval, 5)) * time.Second,
		SyncInterval:  time.Duration(maxInt(payload.Scheduler.AgentSyncInterval, 15)) * time.Second,
		Collectors:    payload.Scheduler.Collectors,
		Permissions:   payload.Scheduler.Permissions,
		Notes:         payload.Scheduler.Notes,
	}, nil
}

func enrollAgent(apiBase string, payload EnrollmentRequest) (*EnrollmentResponse, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(apiBase, "/")+"/agents/enroll/", bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, readHTTPError(resp, "enroll")
	}

	var output EnrollmentResponse
	if err := json.NewDecoder(resp.Body).Decode(&output); err != nil {
		return nil, err
	}
	return &output, nil
}

func quickEnrollAgent(apiBase string, payload QuickEnrollRequest) (*EnrollmentResponse, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(apiBase, "/")+"/agents/quick-enroll/", bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, readHTTPError(resp, "quick-enroll")
	}

	var output EnrollmentResponse
	if err := json.NewDecoder(resp.Body).Decode(&output); err != nil {
		return nil, err
	}
	return &output, nil
}

func sendConfiguredEvents(apiBase, agentID, agentToken string, cfg AgentRuntime) {
	events := buildEvents(cfg)
	if len(events) == 0 {
		log.Printf("all collectors disabled by scheduler profile")
		return
	}

	body, err := json.Marshal(EventBatch{Events: events})
	if err != nil {
		log.Printf("marshal error: %v", err)
		return
	}
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(apiBase, "/")+"/ingest/events/", bytes.NewBuffer(body))
	if err != nil {
		log.Printf("request build error: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Agent-ID", agentID)
	req.Header.Set("X-Agent-Token", agentToken)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("send error: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		log.Printf("backend rejected event batch: %v", readHTTPError(resp, "ingest"))
		return
	}
	log.Printf("event batch sent status=%d count=%d", resp.StatusCode, len(events))
}

func buildEvents(cfg AgentRuntime) []Event {
	out := make([]Event, 0, 5)

	if cfg.Collectors.ProcessActivity {
		if event := collectProcessSnapshot(cfg.Notes); event != nil {
			out = append(out, *event)
		}
	}
	if cfg.Collectors.SecurityLogs {
		if event := collectSecuritySignals(); event != nil {
			out = append(out, *event)
		}
	}
	if cfg.Collectors.NetworkActivity {
		if event := collectNetworkSnapshot(); event != nil {
			out = append(out, *event)
		}
	}
	if cfg.Collectors.SystemLogs {
		if event := collectSystemSnapshot(); event != nil {
			out = append(out, *event)
		}
	}
	if cfg.Collectors.FileChanges {
		if event := collectFileWatchSignals(); event != nil {
			out = append(out, *event)
		}
	}
	return out
}

func collectProcessSnapshot(notes string) *Event {
	result := runCommandSnapshot(processCommandByOS())
	if len(result.Output) == 0 {
		return nil
	}
	return &Event{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		EventType: "process_snapshot",
		Severity:  "low",
		Data: map[string]interface{}{
			"source":       runtime.GOOS,
			"command":      result.Command,
			"top_entries":  result.Output,
			"policy_notes": notes,
		},
	}
}

func collectSecuritySignals() *Event {
	logFile := firstExistingFile(securityLogCandidatesByOS())
	if logFile == "" {
		return nil
	}
	result := runCommandSnapshot(commandSpec{
		name: "sh",
		args: []string{"-lc", "tail -n 60 " + shellQuote(logFile)},
	})
	if len(result.Output) == 0 {
		return nil
	}
	signals := filterSecurityLines(result.Output)
	if len(signals) == 0 {
		return nil
	}
	severity := "medium"
	if len(signals) >= 8 {
		severity = "high"
	}
	return &Event{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		EventType: "security_log_signal",
		Severity:  severity,
		Data: map[string]interface{}{
			"log_file":     logFile,
			"signal_count": len(signals),
			"signals":      capLines(signals, 12),
		},
	}
}

func collectNetworkSnapshot() *Event {
	result := runCommandSnapshot(networkCommandByOS())
	if len(result.Output) == 0 {
		return nil
	}
	established := countEstablishedConnections(result.Output)
	severity := "low"
	if established >= 150 {
		severity = "high"
	} else if established >= 50 {
		severity = "medium"
	}
	return &Event{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		EventType: "network_snapshot",
		Severity:  severity,
		Data: map[string]interface{}{
			"source":                 runtime.GOOS,
			"command":                result.Command,
			"established_count_hint": established,
			"sample_connections":     capLines(result.Output, 20),
		},
	}
}

func collectSystemSnapshot() *Event {
	now := time.Now().UTC()
	host, _ := os.Hostname()
	return &Event{
		Timestamp: now.Format(time.RFC3339),
		EventType: "system_status",
		Severity:  "low",
		Data: map[string]interface{}{
			"hostname":    host,
			"os":          runtime.GOOS,
			"arch":        runtime.GOARCH,
			"timestamp":   now.Format(time.RFC3339),
			"agent_pid":   os.Getpid(),
			"go_version":  runtime.Version(),
			"cpu_threads": runtime.NumCPU(),
		},
	}
}

func collectFileWatchSignals() *Event {
	// Placeholder for future file integrity monitor implementation.
	return nil
}

type commandSpec struct {
	name string
	args []string
}

func processCommandByOS() commandSpec {
	switch runtime.GOOS {
	case "windows":
		return commandSpec{name: "cmd", args: []string{"/C", "tasklist /FO CSV /NH"}}
	default:
		return commandSpec{name: "sh", args: []string{"-lc", "ps -axo pid,ppid,user,comm,args -ww | sed -n '2,25p'"}}
	}
}

func networkCommandByOS() commandSpec {
	switch runtime.GOOS {
	case "windows":
		return commandSpec{name: "cmd", args: []string{"/C", "netstat -ano"}}
	default:
		return commandSpec{name: "sh", args: []string{"-lc", "netstat -an | sed -n '1,80p'"}}
	}
}

func securityLogCandidatesByOS() []string {
	switch runtime.GOOS {
	case "darwin":
		return []string{"/var/log/system.log", "/var/log/install.log"}
	case "linux":
		return []string{"/var/log/auth.log", "/var/log/secure", "/var/log/syslog", "/var/log/messages"}
	default:
		return nil
	}
}

func runCommandSnapshot(spec commandSpec) commandResult {
	if spec.name == "" {
		return commandResult{}
	}
	cmd := exec.Command(spec.name, spec.args...)
	raw, err := cmd.Output()
	if err != nil {
		return commandResult{Command: strings.Join(append([]string{spec.name}, spec.args...), " ")}
	}
	lines := splitAndCleanLines(string(raw))
	return commandResult{
		Command: strings.Join(append([]string{spec.name}, spec.args...), " "),
		Output:  lines,
	}
}

func splitAndCleanLines(raw string) []string {
	lines := strings.Split(raw, "\n")
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		clean := strings.TrimSpace(line)
		if clean == "" {
			continue
		}
		out = append(out, clean)
	}
	return out
}

func filterSecurityLines(lines []string) []string {
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		lower := strings.ToLower(line)
		if strings.Contains(lower, "fail") ||
			strings.Contains(lower, "denied") ||
			strings.Contains(lower, "invalid") ||
			strings.Contains(lower, "authentication") ||
			strings.Contains(lower, "unauthorized") {
			out = append(out, line)
		}
	}
	return out
}

func countEstablishedConnections(lines []string) int {
	count := 0
	for _, line := range lines {
		lower := strings.ToLower(line)
		if strings.Contains(lower, "established") {
			count++
		}
	}
	return count
}

func capLines(lines []string, max int) []string {
	if len(lines) <= max {
		return lines
	}
	return lines[:max]
}

func firstExistingFile(paths []string) string {
	for _, path := range paths {
		info, err := os.Stat(path)
		if err == nil && !info.IsDir() {
			return path
		}
	}
	return ""
}

func shellQuote(path string) string {
	return "'" + strings.ReplaceAll(path, "'", "'\"'\"'") + "'"
}

func sendHeartbeat(apiBase, agentID, agentToken string) {
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(apiBase, "/")+"/ingest/heartbeat/", bytes.NewBufferString("{}"))
	if err != nil {
		log.Printf("heartbeat request build error: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Agent-ID", agentID)
	req.Header.Set("X-Agent-Token", agentToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("heartbeat error: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		log.Printf("heartbeat rejected: %v", readHTTPError(resp, "heartbeat"))
	}
}

func loadConfig() (AgentConfig, error) {
	path, err := configPath()
	if err != nil {
		return AgentConfig{}, err
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return AgentConfig{}, err
	}
	var cfg AgentConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return AgentConfig{}, err
	}
	return cfg, nil
}

func saveConfig(cfg AgentConfig) error {
	path, err := configPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, raw, 0o600)
}

func configPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".scropids", "agent_config.json"), nil
}

func mergeConfigWithEnv(cfg AgentConfig) AgentConfig {
	cfg.APIBase = firstNonEmpty(os.Getenv("SCROPIDS_API_BASE"), cfg.APIBase, defaultAPIBase)
	cfg.AgentID = firstNonEmpty(os.Getenv("SCROPIDS_AGENT_ID"), cfg.AgentID)
	cfg.AgentToken = firstNonEmpty(os.Getenv("SCROPIDS_AGENT_TOKEN"), cfg.AgentToken)
	cfg.OrganizationSlug = firstNonEmpty(os.Getenv("SCROPIDS_ORG_SLUG"), cfg.OrganizationSlug, defaultOrgSlug)
	cfg.OrgAccessToken = firstNonEmpty(os.Getenv("SCROPIDS_ORG_ACCESS_TOKEN"), cfg.OrgAccessToken, defaultOrgAccessToken)
	cfg.Hostname = firstNonEmpty(os.Getenv("SCROPIDS_HOSTNAME"), cfg.Hostname, hostOrFallback())
	cfg.IPAddress = firstNonEmpty(os.Getenv("SCROPIDS_IP_ADDRESS"), cfg.IPAddress)
	return cfg
}

func prompt(reader *bufio.Reader, label, fallback string) string {
	if fallback != "" {
		fmt.Printf("%s [%s]: ", label, fallback)
	} else {
		fmt.Printf("%s: ", label)
	}
	line, _ := reader.ReadString('\n')
	value := strings.TrimSpace(line)
	if value == "" {
		return fallback
	}
	return value
}

func isInteractiveShell() bool {
	info, err := os.Stdin.Stat()
	if err != nil {
		return false
	}
	return (info.Mode() & os.ModeCharDevice) != 0
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getenvBool(key string, fallback bool) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if v == "" {
		return fallback
	}
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

func parseDurationWithFallback(raw string, fallback time.Duration) time.Duration {
	d, err := time.ParseDuration(raw)
	if err != nil || d <= 0 {
		return fallback
	}
	return d
}

func hostOrFallback() string {
	hostname, err := os.Hostname()
	if err != nil || hostname == "" {
		return "endpoint"
	}
	return hostname
}

func readHTTPError(resp *http.Response, operation string) error {
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if len(body) == 0 {
		return &httpStatusError{StatusCode: resp.StatusCode, Operation: operation}
	}
	return fmt.Errorf("%s request failed status=%d body=%s", operation, resp.StatusCode, strings.TrimSpace(string(body)))
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func printBanner() {
	fmt.Println("====================================")
	fmt.Println("        ScropIDS Agent")
	fmt.Println("====================================")
}

type httpStatusError struct {
	StatusCode int
	Operation  string
}

func (e *httpStatusError) Error() string {
	return e.Operation + " request failed with status " + http.StatusText(e.StatusCode)
}
