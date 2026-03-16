# ScropIDS Production Architecture

## Data Flow

1. User creates organization (tenant) and configures LLM provider.
2. User creates one-time agent enrollment token.
3. Endpoint agent enrolls and receives `agent_id` + `agent_token`.
4. Agent submits strict JSON events to `POST /api/v1/ingest/events/`.
5. Scheduler tick aggregates unprocessed events per tenant.
6. Aggregates are sent to tenant-selected LLM provider.
7. LLM JSON response is validated and stored.
8. Alert engine creates tenant-scoped alerts based on threshold.
9. Dashboard consumes tenant-filtered APIs for analyst workflows.

## Core Components

- `backend/apps/core/models.py`
  - `Organization`
  - `OrganizationMembership`
  - `AgentEnrollmentToken`
  - `Agent`
  - `Event`
  - `SchedulerConfig`
  - `LLMProviderConfig`
  - `AggregatedWindow`
  - `Alert`
- `backend/apps/core/services/pipeline.py`
  - Aggregation windows
  - LLM analysis execution
  - Alert emission
- `backend/apps/core/services/llm.py`
  - OpenAI-compatible call path
  - Ollama call path
  - Strict JSON validation

## Scheduler

- Celery beat triggers `scheduler_tick` every minute.
- Tick checks configured interval before processing per organization.
- Config is runtime-editable in DB (`SchedulerConfig`) for each tenant.

## Security Baseline

- Tenant isolation via `organization_id` ownership on records.
- Tenant context by user membership and optional `X-Organization-Slug` header.
- Agent token auth via `X-Agent-ID` + `X-Agent-Token`.
- One-time agent enrollment tokens with expiry and single-use semantics.
- API keys encrypted at rest with Fernet.
- Strict JSON parsing/validation for LLM output.
- Alert creation requires threshold match.
