package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestFetchRuntimeConfigWithRecoveryReEnrollsStaleAgent(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	var (
		runtimeConfigCalls int
		quickEnrollCalls   int
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/ingest/config/":
			runtimeConfigCalls++
			if r.Header.Get("X-Agent-ID") != "fresh-agent-id" || r.Header.Get("X-Agent-Token") != "fresh-agent-token" {
				w.WriteHeader(http.StatusForbidden)
				_, _ = w.Write([]byte(`{"detail":"Invalid agent credentials."}`))
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"scheduler":{"name":"default","is_active":true,"agent_sync_interval":60,"agent_event_interval":15,"collectors":{"system_logs":true,"security_logs":true,"network_activity":true,"process_activity":true,"file_changes":false},"permissions":{"require_elevated_permissions":false},"notes":"","updated_at":"2026-04-28T00:00:00Z"}}`))
		case "/api/v1/agents/quick-enroll/":
			quickEnrollCalls++
			var payload QuickEnrollRequest
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("decode quick enroll payload: %v", err)
			}
			if payload.OrganizationSlug != "scropids-workspace" {
				t.Fatalf("unexpected org slug: %s", payload.OrganizationSlug)
			}
			if payload.AccessToken != "org-secret" {
				t.Fatalf("unexpected access token")
			}
			if payload.OperatingSystem != runtime.GOOS {
				t.Fatalf("unexpected operating system: %s", payload.OperatingSystem)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"agent_id":"fresh-agent-id","agent_token":"fresh-agent-token","organization_slug":"scropids-workspace"}`))
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	cfg := AgentConfig{
		APIBase:          server.URL + "/api/v1",
		AgentID:          "stale-agent-id",
		AgentToken:       "stale-agent-token",
		OrganizationSlug: "scropids-workspace",
		OrgAccessToken:   "org-secret",
		Hostname:         "demo-mac",
	}

	runtimeCfg, err := fetchRuntimeConfigWithRecovery(&cfg)
	if err != nil {
		t.Fatalf("fetchRuntimeConfigWithRecovery returned error: %v", err)
	}

	if runtimeConfigCalls != 2 {
		t.Fatalf("expected 2 runtime config calls, got %d", runtimeConfigCalls)
	}
	if quickEnrollCalls != 1 {
		t.Fatalf("expected 1 quick enroll call, got %d", quickEnrollCalls)
	}
	if cfg.AgentID != "fresh-agent-id" || cfg.AgentToken != "fresh-agent-token" {
		t.Fatalf("config was not updated with recovered credentials: %#v", cfg)
	}
	if runtimeCfg.EventInterval.Seconds() != 15 {
		t.Fatalf("unexpected event interval: %s", runtimeCfg.EventInterval)
	}

	path, err := configPath()
	if err != nil {
		t.Fatalf("configPath returned error: %v", err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("expected recovered config file at %s: %v", path, err)
	}
	var saved AgentConfig
	if err := json.Unmarshal(raw, &saved); err != nil {
		t.Fatalf("saved config is invalid json: %v", err)
	}
	if saved.AgentID != "fresh-agent-id" || saved.AgentToken != "fresh-agent-token" {
		t.Fatalf("saved config did not persist recovered credentials: %#v", saved)
	}
	if filepath.Base(path) != "agent_config.json" {
		t.Fatalf("unexpected config file path: %s", path)
	}
}
