# ScropIDS Frontend Platform Setup

## Frontend Stack

- React + Vite + TypeScript
- TailwindCSS
- shadcn-style UI primitives
- Axios
- React Router
- Recharts
- Lucide icons
- Framer Motion

## Required Pages Implemented

- Login (`/login`)
- Dashboard (`/`)
- Alerts (`/alerts`)
- Agents (`/agents`)
- Agent Timeline (`/agents/:agentId`)
- LLM Config (`/llm-config`)
- Scheduler Config (`/scheduler`)
- Enrollment Tokens (`/enrollment-tokens`)

## Backend Additions (Minimal Required)

- Session auth endpoints:
  - `GET /api/v1/auth/csrf/`
  - `POST /api/v1/auth/login/`
  - `POST /api/v1/auth/logout/`
  - `GET /api/v1/auth/me/`
- Health endpoint:
  - `GET /api/v1/health/`
- Agent timeline endpoint:
  - `GET /api/v1/agents/<uuid>/timeline/`
- CORS/security toggles added to Django settings for HTTPS readiness.

## Docker Runtime

`docker compose up --build` starts:

- frontend (nginx serving built assets on 80/443)
- backend (gunicorn)
- worker (celery)
- beat (celery beat)
- postgres (private network only)
- redis (private network only)

Frontend proxies `/api/*` to backend internally.
