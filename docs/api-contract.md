# ScropIDS API Contract (v1)

## Tenant Context

Dashboard user APIs are scoped to organization membership.

Optional header for explicit tenant selection:

- `X-Organization-Slug: <tenant-slug>`

## Organization + Enrollment

### `POST /api/v1/organizations/`

Auth: dashboard user (session/basic)

Body:

```json
{
  "name": "Acme SOC"
}
```

Response:

```json
{
  "id": "uuid",
  "name": "Acme SOC",
  "slug": "acme-soc",
  "created_at": "2026-02-24T20:00:00+00:00"
}
```

### `POST /api/v1/agent-enrollment-tokens/`

Auth: tenant admin/owner

Body:

```json
{
  "description": "Windows endpoints wave 1",
  "expires_in_hours": 24
}
```

Response:

```json
{
  "id": 1,
  "organization_slug": "acme-soc",
  "description": "Windows endpoints wave 1",
  "expires_at": "2026-02-25T20:00:00+00:00",
  "used_at": null,
  "created_at": "2026-02-24T20:00:00+00:00",
  "enrollment_token": "raw-one-time-token"
}
```

### `POST /api/v1/agents/enroll/`

Auth: none (token-based enrollment)

Body:

```json
{
  "organization_slug": "acme-soc",
  "enrollment_token": "raw-one-time-token",
  "hostname": "win-lab-01",
  "operating_system": "windows",
  "ip_address": "203.0.113.10"
}
```

Response:

```json
{
  "agent_id": "uuid",
  "agent_token": "raw-agent-token",
  "organization_slug": "acme-soc"
}
```

## Agent Ingest

### `POST /api/v1/ingest/events/`

Headers:

- `X-Agent-ID: <uuid>`
- `X-Agent-Token: <opaque token>`

Body:

```json
{
  "events": [
    {
      "timestamp": "2026-02-24T19:12:22Z",
      "event_type": "process_creation",
      "severity": "medium",
      "data": {
        "process_name": "powershell.exe",
        "command_line": "powershell -enc aW52b2tl",
        "parent_process": "explorer.exe",
        "user": "admin"
      }
    }
  ]
}
```

Response:

```json
{
  "accepted": 1
}
```

### `POST /api/v1/ingest/heartbeat/`

Headers:

- `X-Agent-ID`
- `X-Agent-Token`

Response:

```json
{
  "status": "ok",
  "agent_id": "<uuid>",
  "organization_slug": "acme-soc"
}
```

## Dashboard

### `GET /api/v1/dashboard/overview/`

Response:

```json
{
  "totals": {
    "agents": 8,
    "events_24h": 25701,
    "active_alerts": 12,
    "aggregates_pending_llm": 3
  },
  "threat_distribution": [
    { "threat_level": "medium", "count": 9 },
    { "threat_level": "high", "count": 3 }
  ],
  "confidence_heatmap": [
    { "agent__hostname": "win-lab-01", "avg_confidence": 86.5, "count": 2 }
  ],
  "generated_at": "2026-02-24T20:00:00+00:00"
}
```

## LLM Output JSON Schema

```json
{
  "threat_level": "low | medium | high | critical",
  "confidence": 0,
  "reasoning": "string",
  "recommended_action": "string"
}
```
