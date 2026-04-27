# ScropIDS Go Agent (Starter)

Current implementation is a scaffold that emits sample normalized JSON events to backend.

## Build

```bash
cd agents/go
go build -o scropids-agent ./cmd/agent
```

## Build Downloadable Artifacts (All Platforms)

```bash
cd /Users/nagu/Desktop/Capston
chmod +x agents/go/scripts/build_artifacts.sh
./agents/go/scripts/build_artifacts.sh
```

This generates downloadable packages in:

```bash
backend/agent_downloads/
```

Generated targets:

- windows/amd64
- windows/arm64
- linux/amd64
- linux/arm64
- darwin/amd64
- darwin/arm64

Generated package types:

- `.zip` for all targets
- `.exe` standalone for Windows
- `.deb` for Linux
- `.dmg` for macOS (when `hdiutil` is available)

## Run (organization access token - recommended)

```bash
SCROPIDS_API_BASE=http://localhost:8000/api/v1 \
SCROPIDS_ORG_SLUG=acme-soc \
SCROPIDS_ORG_ACCESS_TOKEN=<org-access-token> \
./scropids-agent
```

## Run (pre-created credentials)

```bash
SCROPIDS_AGENT_ID=<uuid> \
SCROPIDS_AGENT_TOKEN=<token> \
SCROPIDS_API_BASE=http://localhost:8000/api/v1 \
SCROPIDS_INTERVAL=15s \
./scropids-agent
```

## Run (one-time enrollment token)

```bash
SCROPIDS_ORG_SLUG=acme-soc \
SCROPIDS_ENROLLMENT_TOKEN=<one-time-token> \
SCROPIDS_API_BASE=https://your-domain/api/v1 \
SCROPIDS_INTERVAL=15s \
./scropids-agent
```

## Interactive Setup (Recommended)

Run without env vars and use setup wizard:

```bash
./scropids-agent --setup
```

Saved local config:

```bash
~/.scropids/agent_config.json
```

Recommended onboarding:

1. In web app, open `Agent Setup`.
2. Create agent credentials (`agent_id` + `agent_token`).
3. Run `./scropids-agent --setup` and choose credentials mode.

## Scheduler Sync (Server -> Agent)

After enrollment, the agent automatically polls:

```text
GET /api/v1/ingest/config/
```

and applies:

- agent sync interval
- agent event interval
- enabled collectors (system/security/network/process/file)
- permission guidance flag

Legacy enrollment token mode is still supported for backward compatibility.

## Next Collector Modules

- Windows event logs collector.
- Linux journal/syslog collector.
- macOS unified logs collector.
- Process and network monitor.
- File integrity monitor.
