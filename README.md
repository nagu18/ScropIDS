# ScropIDS

ScropIDS is a production-oriented IDS platform with:

- Cross-platform endpoint agents (Windows/Linux/macOS).
- Django + DRF backend for ingest, aggregation, LLM analysis, and alerts.
- Celery + Redis scheduler.
- PostgreSQL JSONB-friendly data model.
- Dual LLM mode (OpenAI-compatible APIs and local Ollama).
- React dashboard starter.

## Monorepo Layout

- `backend/` Django API, pipeline, and scheduler.
- `frontend/` React dashboard starter.
- `agents/go/` Go-based agent starter.
- `docs/` Technical documentation.

## Quick Start (Docker Demo Stack)

Detailed startup guide:

- [docs/start-methods.md](/Users/nagu/Desktop/Capston/docs/start-methods.md)

Start everything with one command:

```bash
docker compose up -d --build
```

On first boot the backend seeds a ready-to-demo state automatically:

- workspace: `ScropIDS Workspace`
- admin user: `admin / admin`
- normal user: `normal / normal`
- default scheduler profile
- organization agent access token
- optional OpenRouter provider if `SCROPIDS_BOOTSTRAP_LLM_API_KEY` is set

Open:

- Frontend: `http://localhost`
- Frontend (TLS): `https://localhost`
- Admin via proxy: `http://localhost/admin/`
- Direct backend API: `http://localhost:8000/api/v1/`
- Health check: `http://localhost:8000/api/v1/health/`

Useful commands:

```bash
docker compose logs -f backend
docker compose ps
docker compose down
```

## Running the Agent in Docker

After bootstrap completes, you'll see the agent access token in the logs. Start the agent service:

```bash
# 1. Check bootstrap output for the agent access token:
docker compose logs backend | grep -A 5 "Docker Agent Setup"

# 2. Set the environment variables (or update .env):
export SCROPIDS_AGENT_ORG_ACCESS_TOKEN="<token-from-bootstrap>"
export SCROPIDS_AGENT_API_BASE=http://backend:8000/api/v1
export SCROPIDS_AGENT_ORG_SLUG=scropids-workspace

# 3. Start the agent service:
docker compose up -d agent

# 4. Watch agent logs:
docker compose logs -f agent
```

If you want a clean seeded environment again on next boot:

```bash
SCROPIDS_BOOTSTRAP_FORCE_RESET=True docker compose up -d
```

## Docker Hub Flow

Tag the images with your Docker Hub repo names:

```bash
export SCROPIDS_BACKEND_IMAGE=yourdockerhubusername/scropids-backend:latest
export SCROPIDS_FRONTEND_IMAGE=yourdockerhubusername/scropids-frontend:latest
```

Build and push:

```bash
docker compose build backend frontend
docker compose push backend frontend
```

Run from Docker Hub images only:

```bash
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

Optional: preload the demo LLM provider at startup without baking the key into the image:

```bash
export SCROPIDS_BOOTSTRAP_LLM_API_KEY=your_openrouter_key
docker compose up -d
```

The PostgreSQL and Redis services use official upstream images, so only the ScropIDS backend and frontend images need to be pushed.

## Multi-Tenant SaaS Flow (MVP)

1. Create organization: `POST /api/v1/organizations/`
2. Create enrollment token: `POST /api/v1/agent-enrollment-tokens/`
3. Enroll endpoint agent: `POST /api/v1/agents/enroll/`
4. Send events: `POST /api/v1/ingest/events/` using `X-Agent-ID` + `X-Agent-Token`
5. Query tenant data with optional context header:
   - `X-Organization-Slug: <tenant-slug>`

## Local Backend Run

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver
```

## Frontend Stack

- React + Vite + TypeScript
- TailwindCSS
- shadcn-style UI components
- Axios + React Router
- Recharts + Lucide icons

## Next Steps

1. Implement OS-specific collection modules in `agents/go`.
2. Add auth and RBAC policy in frontend/backend.
3. Expand dashboard visualizations and playbooks.

## Alert Channels

Optional outbound channels are supported through env vars:

- `ALERT_EMAIL_TO` (comma-separated)
- `SLACK_WEBHOOK_URL`
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`

## Agent Create Command (Admin Utility)

```bash
docker compose exec backend python manage.py create_agent --org-slug acme --hostname win-lab-01 --os windows
```

Full SaaS smoke test steps: `docs/smoke-test-saas.md`
