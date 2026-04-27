# ScropIDS Simple Guide

## 1. What is ready now

- Multi-tenant SaaS backend (`Organization` based).
- Admin users can create organizations.
- Organization-level agent access token flow (resettable).
- Agent receives `agent_id` and `agent_token`.
- Agent sends logs to ingest API.
- Scheduler aggregates logs and processes them.
- Dashboard overview shows tenant-specific data.

## 2. Start the project (local)

```bash
cd /Users/nagu/Desktop/Capston
cp backend/.env.example backend/.env
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
cd backend
python manage.py migrate
python manage.py runserver 127.0.0.1:8000 --noreload
```

Open:
- API: `http://127.0.0.1:8000/api/v1/`
- Admin: `http://127.0.0.1:8000/admin/`

## 3. Create admin (if needed)

```bash
cd /Users/nagu/Desktop/Capston/backend
source .venv/bin/activate
python manage.py createsuperuser
```

## 4. SaaS flow test (quick, simplified)

### A) Create organization

```bash
curl -u <ADMIN_USER>:<ADMIN_PASS> -X POST http://127.0.0.1:8000/api/v1/organizations/ \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme SOC"}'
```

Save `slug` (example: `acme-soc`).

### B) Get/Reset organization access token

```bash
curl -u <ADMIN_USER>:<ADMIN_PASS> http://127.0.0.1:8000/api/v1/agents/access-token/ \
  -H "X-Organization-Slug: acme-soc"
```

Reset token:

```bash
curl -u <ADMIN_USER>:<ADMIN_PASS> -X POST http://127.0.0.1:8000/api/v1/agents/access-token/ \
  -H "X-Organization-Slug: acme-soc"
```

### C) Quick enroll using organization access token

```bash
curl -X POST http://127.0.0.1:8000/api/v1/agents/quick-enroll/ \
  -H "Content-Type: application/json" \
  -d '{"organization_slug":"acme-soc","access_token":"<ORG_ACCESS_TOKEN>","hostname":"win-lab-01","operating_system":"windows","ip_address":"203.0.113.10"}'
```

Save `agent_id` and `agent_token`.

### D) Send test event

```bash
curl -X POST http://127.0.0.1:8000/api/v1/ingest/events/ \
  -H "Content-Type: application/json" \
  -H "X-Agent-ID: <AGENT_ID>" \
  -H "X-Agent-Token: <AGENT_TOKEN>" \
  -d '{"events":[{"event_type":"process_creation","severity":"high","data":{"process_name":"powershell.exe","command_line":"powershell -enc aW52b2tl"}}]}'
```

### E) Run scheduler manually

```bash
cd /Users/nagu/Desktop/Capston/backend
source .venv/bin/activate
python manage.py shell -c "from apps.core.services.pipeline import run_scheduler_tick; print(run_scheduler_tick())"
```

### F) Check dashboard overview

```bash
curl -u <ADMIN_USER>:<ADMIN_PASS> http://127.0.0.1:8000/api/v1/dashboard/overview/ \
  -H "X-Organization-Slug: acme-soc"
```

## 5. Current expected behavior

- Ingest works (`{"accepted":1}`).
- Agent heartbeat works.
- Aggregation works.
- If no LLM provider is configured:
  - pipeline stores fallback LLM output,
  - alerts may remain 0.

## 6. To get real LLM alerts

Add at least one active LLM provider (`/api/v1/llm-providers/`) for your tenant.

Then send events and run scheduler again.

## 7. Downloadable agents (all platforms)

Build cross-platform packages:

```bash
cd /Users/nagu/Desktop/Capston
chmod +x agents/go/scripts/build_artifacts.sh
./agents/go/scripts/build_artifacts.sh
```

Generated files are placed in:

```bash
backend/agent_downloads/
```

API endpoints:

- `GET /api/v1/agent-downloads/` -> artifact manifest
- `GET /api/v1/agent-downloads/<filename>/` -> download zip

UI:

- Open `Agents` page
- Reset/copy organization access token
- Download package and use one-line run command

Additional package formats:

- Windows: `.exe`
- Linux: `.deb`
- macOS: `.dmg`

## 8. Agent Scheduler Management

Open `Scheduler` page to configure both:

- server aggregation scheduler
- agent runtime scheduler profile

Agent runtime profile includes:

- sync interval (`agent_sync_interval`)
- event interval (`agent_event_interval`)
- enabled log collectors
- elevated-permission policy flag
- profile notes

Agents automatically sync this config from:

```text
GET /api/v1/ingest/config/
```

Agent setup can be fully interactive:

```bash
./scropids-agent --setup
```

Legacy one-time enrollment endpoint still exists for compatibility, but the recommended flow is org access token quick-enroll.
