# ScropIDS Start Methods

This guide explains every supported way to start ScropIDS.

It covers:

- running from the repo with `docker compose`
- running pulled Docker Hub images with `docker compose`
- running everything manually with `docker run`
- running directly from source code without Docker
- reset, stop, health-check, and troubleshooting steps

## What The Demo Starts With

On first boot, the packaged demo environment creates:

- workspace: `ScropIDS Workspace`
- workspace slug: `scropids-workspace`
- admin user: `admin / admin`
- normal user: `normal / normal`
- one default scheduler profile
- one organization agent access token
- default demo agent token: `scropids-demo-agent-access-token`
- one LLM provider record: `OpenRouter Gemma 4 31B Free`

Important note:

- the OpenRouter provider record is created automatically
- it is only active if `SCROPIDS_BOOTSTRAP_LLM_API_KEY` is set at startup
- the Docker demo keeps the same organization agent token by default, so agents can auto-recover after a clean reset

## Main URLs

When the stack is running, use:

- frontend: [http://localhost](http://localhost)
- admin panel: [http://localhost/admin/](http://localhost/admin/)
- backend API root: [http://localhost:8000/api/v1/](http://localhost:8000/api/v1/)
- health check: [http://localhost:8000/api/v1/health/](http://localhost:8000/api/v1/health/)

## Method 1: Run From Repo With Docker Compose

This is the easiest and recommended method if you have the full project folder.

### Requirements

- Docker Desktop installed and running
- this project folder available locally

### Start

```bash
cd /Users/nagu/Desktop/Capston
docker compose up -d --build
```

This starts:

- `postgres`
- `redis`
- `backend`
- `worker`
- `beat`
- `frontend`

The default demo agent token is:

- `scropids-demo-agent-access-token`

### Verify

```bash
docker compose ps
```

You should see the services running, and `backend` and `frontend` should become healthy.

Check health:

```bash
curl http://localhost:8000/api/v1/health/
```

Open the app:

- [http://localhost](http://localhost)

### Login

- `admin / admin`
- `normal / normal`

### Useful Commands

Show all services:

```bash
docker compose ps
```

Backend logs:

```bash
docker compose logs -f backend
```

All logs:

```bash
docker compose logs -f
```

Stop services:

```bash
docker compose down
```

Stop and delete database volume for a full reset:

```bash
docker compose down -v
docker compose up -d --build
```

### Force A Fresh Demo Reset On Next Boot

If you want the bootstrap command to rebuild the clean demo workspace again:

```bash
SCROPIDS_BOOTSTRAP_FORCE_RESET=True docker compose up -d
```

### Enable OpenRouter On First Boot

If you want the seeded provider to be active immediately:

```bash
export SCROPIDS_BOOTSTRAP_LLM_API_KEY="your_openrouter_key"
docker compose up -d --build
```

## Method 2: Run Pulled Docker Hub Images With Docker Compose

Use this when you want to run the published Docker Hub images instead of building locally.

Published images:

- `nagu2004/scropids-backend:latest`
- `nagu2004/scropids-frontend:latest`

### Pull Images

```bash
docker pull nagu2004/scropids-backend:latest
docker pull nagu2004/scropids-frontend:latest
```

### Start With The Image-Only Compose File

This repo includes an image-only compose file:

- [docker-compose.hub.yml](/Users/nagu/Desktop/Capston/docker-compose.hub.yml)

Run:

```bash
cd /Users/nagu/Desktop/Capston
docker compose -f docker-compose.hub.yml up -d
```

This will pull or use:

- `postgres:16`
- `redis:7`
- `nagu2004/scropids-backend:latest`
- `nagu2004/scropids-frontend:latest`

The default demo agent token is:

- `scropids-demo-agent-access-token`

### Verify

```bash
docker compose -f docker-compose.hub.yml ps
curl http://localhost:8000/api/v1/health/
```

### Stop

```bash
docker compose -f docker-compose.hub.yml down
```

### Full Reset

```bash
docker compose -f docker-compose.hub.yml down -v
docker compose -f docker-compose.hub.yml up -d
```

### Optional OpenRouter Key

```bash
export SCROPIDS_BOOTSTRAP_LLM_API_KEY="your_openrouter_key"
docker compose -f docker-compose.hub.yml up -d
```

## Method 3: Run Everything Manually With Docker Run

Use this if you want to start each container yourself instead of using compose.

This method is longer, but it works even if you prefer direct `docker run` commands.

### Step 1: Pull All Required Images

```bash
docker pull nagu2004/scropids-backend:latest
docker pull nagu2004/scropids-frontend:latest
docker pull postgres:16
docker pull redis:7
```

### Step 2: Create Network And Volume

```bash
docker network create scropids-net
docker volume create scropids-postgres-data
```

### Step 3: Start PostgreSQL

```bash
docker run -d \
  --name postgres \
  --network scropids-net \
  -e POSTGRES_DB=scropids \
  -e POSTGRES_USER=scropids \
  -e POSTGRES_PASSWORD=scropids \
  -v scropids-postgres-data:/var/lib/postgresql/data \
  postgres:16
```

### Step 4: Start Redis

```bash
docker run -d \
  --name redis \
  --network scropids-net \
  redis:7
```

### Step 5: Start Backend

```bash
docker run -d \
  --name backend \
  --network scropids-net \
  -p 8000:8000 \
  -e DJANGO_SECRET_KEY=scropids-docker-demo-secret \
  -e DJANGO_DEBUG=True \
  -e DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0,backend \
  -e SCROPIDS_ENCRYPTION_KEY=scropids-docker-demo-encryption-key \
  -e USE_SQLITE=False \
  -e POSTGRES_DB=scropids \
  -e POSTGRES_USER=scropids \
  -e POSTGRES_PASSWORD=scropids \
  -e POSTGRES_HOST=postgres \
  -e POSTGRES_PORT=5432 \
  -e REDIS_URL=redis://redis:6379/0 \
  -e CELERY_BROKER_URL=redis://redis:6379/0 \
  -e CELERY_RESULT_BACKEND=redis://redis:6379/1 \
  -e FRONTEND_ORIGIN=http://localhost \
  -e CORS_ALLOWED_ORIGINS=http://localhost,http://127.0.0.1,https://localhost,https://127.0.0.1 \
  -e CSRF_TRUSTED_ORIGINS=http://localhost,http://127.0.0.1,https://localhost,https://127.0.0.1 \
  -e SESSION_COOKIE_SECURE=False \
  -e CSRF_COOKIE_SECURE=False \
  -e SECURE_SSL_REDIRECT=False \
  -e SCROPIDS_ADMIN_LOCALHOST_ONLY=True \
  -e SCROPIDS_ADMIN_LOCAL_HOSTS=localhost,127.0.0.1,::1 \
  -e SCROPIDS_AGENT_ARTIFACTS_DIR=/app/agent_downloads \
  -e SCROPIDS_BOOTSTRAP_ENABLED=True \
  -e SCROPIDS_BOOTSTRAP_FORCE_RESET=False \
  -e SCROPIDS_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e SCROPIDS_BOOTSTRAP_ADMIN_PASSWORD=admin \
  -e SCROPIDS_BOOTSTRAP_NORMAL_USERNAME=normal \
  -e SCROPIDS_BOOTSTRAP_NORMAL_PASSWORD=normal \
  -e SCROPIDS_BOOTSTRAP_WORKSPACE_NAME="ScropIDS Workspace" \
  -e SCROPIDS_BOOTSTRAP_AGENT_ACCESS_TOKEN="scropids-demo-agent-access-token" \
  -e SCROPIDS_BOOTSTRAP_NORMAL_ROLE=analyst \
  -e SCROPIDS_BOOTSTRAP_LLM_PROVIDER_NAME="OpenRouter Gemma 4 31B Free" \
  -e SCROPIDS_BOOTSTRAP_LLM_PROVIDER_TYPE=openai_compatible \
  -e SCROPIDS_BOOTSTRAP_LLM_BASE_URL=https://openrouter.ai/api/v1 \
  -e SCROPIDS_BOOTSTRAP_LLM_MODEL=google/gemma-4-31b-it:free \
  -e SCROPIDS_BOOTSTRAP_LLM_TIMEOUT_SECONDS=60 \
  nagu2004/scropids-backend:latest
```

If you want OpenRouter active immediately, add:

```bash
-e SCROPIDS_BOOTSTRAP_LLM_API_KEY="your_openrouter_key"
```

If you want your own fixed workspace token instead of the demo token, replace:

```bash
-e SCROPIDS_BOOTSTRAP_AGENT_ACCESS_TOKEN="scropids-demo-agent-access-token"
```

### Step 6: Verify Backend Startup

Watch backend logs:

```bash
docker logs -f backend
```

Check health:

```bash
curl http://localhost:8000/api/v1/health/
```

### Step 7: Start Celery Worker

```bash
docker run -d \
  --name worker \
  --network scropids-net \
  --entrypoint celery \
  -e DJANGO_SECRET_KEY=scropids-docker-demo-secret \
  -e DJANGO_DEBUG=True \
  -e DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0,backend \
  -e SCROPIDS_ENCRYPTION_KEY=scropids-docker-demo-encryption-key \
  -e USE_SQLITE=False \
  -e POSTGRES_DB=scropids \
  -e POSTGRES_USER=scropids \
  -e POSTGRES_PASSWORD=scropids \
  -e POSTGRES_HOST=postgres \
  -e POSTGRES_PORT=5432 \
  -e REDIS_URL=redis://redis:6379/0 \
  -e CELERY_BROKER_URL=redis://redis:6379/0 \
  -e CELERY_RESULT_BACKEND=redis://redis:6379/1 \
  nagu2004/scropids-backend:latest \
  -A scropids worker --loglevel=info
```

### Step 8: Start Celery Beat

```bash
docker run -d \
  --name beat \
  --network scropids-net \
  --entrypoint celery \
  -e DJANGO_SECRET_KEY=scropids-docker-demo-secret \
  -e DJANGO_DEBUG=True \
  -e DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0,backend \
  -e SCROPIDS_ENCRYPTION_KEY=scropids-docker-demo-encryption-key \
  -e USE_SQLITE=False \
  -e POSTGRES_DB=scropids \
  -e POSTGRES_USER=scropids \
  -e POSTGRES_PASSWORD=scropids \
  -e POSTGRES_HOST=postgres \
  -e POSTGRES_PORT=5432 \
  -e REDIS_URL=redis://redis:6379/0 \
  -e CELERY_BROKER_URL=redis://redis:6379/0 \
  -e CELERY_RESULT_BACKEND=redis://redis:6379/1 \
  nagu2004/scropids-backend:latest \
  -A scropids beat --loglevel=info
```

### Step 9: Start Frontend

Important:

- the frontend Nginx config proxies API traffic to `http://backend:8000`
- because of that, the backend container name should stay exactly `backend`
- both containers must be on the same Docker network

Run frontend:

```bash
docker run -d \
  --name frontend \
  --network scropids-net \
  -p 80:80 \
  -p 443:443 \
  nagu2004/scropids-frontend:latest
```

### Step 10: Open The App

- [http://localhost](http://localhost)
- [http://localhost/admin/](http://localhost/admin/)
- [http://localhost:8000/api/v1/health/](http://localhost:8000/api/v1/health/)

### Step 11: Stop Manual Containers

```bash
docker stop frontend beat worker backend redis postgres
docker rm frontend beat worker backend redis postgres
```

### Step 12: Full Reset For Manual Docker Run

```bash
docker volume rm scropids-postgres-data
docker network rm scropids-net
```

## Method 4: Run Directly From Source Code

Use this for development, debugging, or editing the project locally.

### Backend

```bash
cd /Users/nagu/Desktop/Capston/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py bootstrap_demo_environment --force-reset True
python manage.py runserver 127.0.0.1:8000
```

### Frontend

Open a second terminal:

```bash
cd /Users/nagu/Desktop/Capston/frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

### Open

- [http://127.0.0.1:5173](http://127.0.0.1:5173)
- [http://127.0.0.1:8000/admin/](http://127.0.0.1:8000/admin/)
- [http://127.0.0.1:8000/api/v1/health/](http://127.0.0.1:8000/api/v1/health/)

### Optional: Run Full Scheduler Background Services From Source

If you want the full background pipeline, run Redis and then start the worker and beat processes.

Example Redis with Docker:

```bash
docker run -d --name scropids-dev-redis -p 6379:6379 redis:7
```

Then in separate terminals:

```bash
cd /Users/nagu/Desktop/Capston/backend
source .venv/bin/activate
celery -A scropids worker --loglevel=info
```

```bash
cd /Users/nagu/Desktop/Capston/backend
source .venv/bin/activate
celery -A scropids beat --loglevel=info
```

### If You Only Run Django Without Worker/Beat

You can still process queued events manually:

```bash
cd /Users/nagu/Desktop/Capston/backend
source .venv/bin/activate
python manage.py shell -c "from apps.core.services.pipeline import run_scheduler_tick; print(run_scheduler_tick())"
```

## Health Check And Smoke Verification

Use these checks after startup.

### Backend Health

```bash
curl http://localhost:8000/api/v1/health/
```

Expected response:

```json
{
  "status": "ok",
  "database": "ok"
}
```

### Docker Services

Compose:

```bash
docker compose ps
```

Hub compose:

```bash
docker compose -f docker-compose.hub.yml ps
```

Manual Docker:

```bash
docker ps
```

### Admin Login

Open:

- [http://localhost/admin/](http://localhost/admin/)

Login with:

- username: `admin`
- password: `admin`

### App Login

Open:

- [http://localhost](http://localhost)

Login with:

- username: `admin`
- password: `admin`

or:

- username: `normal`
- password: `normal`

## Agent Download Check

After login as `admin`:

1. open the `Agents` page
2. check that the organization access token is visible
3. confirm the downloadable packages are listed
4. use the generated one-line command to connect a real endpoint agent

The packaged Docker demo includes the built agent artifacts already.

If an older saved agent config becomes stale after a rebuild, running the agent again will either re-enroll automatically or reopen the terminal setup wizard.

## Troubleshooting

### Port 80 Or 8000 Already In Use

Stop the service currently using the port, or change the port mapping in the compose file or `docker run` command.

### Frontend Opens But API Calls Fail

Check:

- backend container is running
- frontend container is running
- backend container name is `backend` for the manual `docker run` method
- both containers are on the same Docker network

### Admin Page Not Opening

ScropIDS admin is restricted to localhost by default.

Use one of:

- [http://localhost/admin/](http://localhost/admin/)
- [http://127.0.0.1/admin/](http://127.0.0.1/admin/)

### Fresh Demo State Needed

Use one of these:

Compose local build:

```bash
docker compose down -v
docker compose up -d --build
```

Compose Docker Hub:

```bash
docker compose -f docker-compose.hub.yml down -v
docker compose -f docker-compose.hub.yml up -d
```

Manual Docker:

```bash
docker stop frontend beat worker backend redis postgres
docker rm frontend beat worker backend redis postgres
docker volume rm scropids-postgres-data
docker network rm scropids-net
```

Source code:

```bash
cd /Users/nagu/Desktop/Capston/backend
source .venv/bin/activate
python manage.py bootstrap_demo_environment --force-reset True
```

## Best Recommendation

Use:

- `docker compose up -d --build` if you have the repo
- `docker compose -f docker-compose.hub.yml up -d` if you want to run the Docker Hub images
- manual `docker run` only if you specifically want full control over each container
- direct source-code run only for development work
