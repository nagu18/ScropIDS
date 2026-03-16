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

## Quick Start (Docker)

1. Copy env file:

```bash
cp backend/.env.example backend/.env
```

2. Start services:

```bash
docker compose up --build
```

3. Create admin user:

```bash
docker compose exec backend python manage.py createsuperuser
```

4. Open:

- Frontend: `http://localhost`
- Frontend (TLS): `https://localhost`
- API via proxy: `http://localhost/api/v1/`

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
