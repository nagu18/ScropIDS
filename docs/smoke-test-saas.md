# ScropIDS SaaS Smoke Test

## 1. Start Services

```bash
cd /Users/nagu/Desktop/Capston
cp backend/.env.example backend/.env
docker compose up --build
```

## 2. Create Admin User

```bash
docker compose exec backend python manage.py createsuperuser
```

Use these credentials in the `curl -u` examples below.

## 3. Create Organization

```bash
curl -u admin:adminpass -X POST http://localhost:8000/api/v1/organizations/ \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme SOC"}'
```

Response includes slug (example: `acme-soc`).

## 4. Create One-Time Enrollment Token

```bash
curl -u admin:adminpass -X POST http://localhost:8000/api/v1/agent-enrollment-tokens/ \
  -H "Content-Type: application/json" \
  -H "X-Organization-Slug: acme-soc" \
  -d '{"description":"wave-1","expires_in_hours":24}'
```

Save `enrollment_token` from response.

## 5. Enroll Agent

```bash
curl -X POST http://localhost:8000/api/v1/agents/enroll/ \
  -H "Content-Type: application/json" \
  -d '{"organization_slug":"acme-soc","enrollment_token":"<TOKEN>","hostname":"win-lab-01","operating_system":"windows","ip_address":"203.0.113.10"}'
```

Save `agent_id` and `agent_token`.

## 6. Send Event

```bash
curl -X POST http://localhost:8000/api/v1/ingest/events/ \
  -H "Content-Type: application/json" \
  -H "X-Agent-ID: <AGENT_ID>" \
  -H "X-Agent-Token: <AGENT_TOKEN>" \
  -d '{"events":[{"event_type":"process_creation","severity":"high","data":{"process_name":"powershell.exe","command_line":"powershell -enc aW52b2tl"}}]}'
```

## 7. Trigger Aggregation

```bash
docker compose exec backend python manage.py shell -c "from apps.core.services.pipeline import run_scheduler_tick; print(run_scheduler_tick())"
```

## 8. Check Dashboard Overview

```bash
curl -u admin:adminpass http://localhost:8000/api/v1/dashboard/overview/ \
  -H "X-Organization-Slug: acme-soc"
```
