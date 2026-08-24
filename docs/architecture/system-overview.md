# System Overview

OrbitQueue is a distributed job scheduling platform built as a pnpm monorepo with clear separation between API, workers, scheduler, and frontend.

## Components

### Frontend (`apps/web`)
Next.js 15 dashboard with dark-mode developer-tool aesthetic. Uses TanStack Query for data fetching, Recharts for metrics visualization, and WebSocket connections for live updates.

### API (`apps/api`)
Fastify REST API handling authentication, RBAC, job/queue management, and WebSocket event broadcasting. Structured JSON logging via Pino, Prometheus metrics at `/metrics`.

### Worker (`apps/worker`)
Independent Node.js processes that poll queues, atomically claim jobs via `JobClaimer`, execute handlers with concurrency limits, send heartbeats, and handle graceful shutdown.

### Scheduler (`apps/scheduler`)
Detects due scheduled/recurring jobs, promotes delayed jobs to QUEUED status. Uses Redis distributed lock for leader election to prevent duplicate recurring job generation.

### PostgreSQL
Durable job state store. All state transitions are transactional. Atomic claiming uses `SELECT ... FOR UPDATE SKIP LOCKED`.

### Redis
Distributed coordination: rate limiting, scheduler leader election, distributed locks.

## Event System

WebSocket events broadcast from API:
- JOB_CREATED, JOB_COMPLETED, JOB_FAILED
- WORKER_ONLINE, WORKER_OFFLINE
- QUEUE_PAUSED, QUEUE_RESUMED

## Authentication

JWT access tokens with refresh token rotation. RBAC at organization and project levels with role hierarchy: ADMIN > OPERATOR > DEVELOPER > VIEWER.

## Job Lifecycle

```
QUEUED → CLAIMED → RUNNING → COMPLETED
                           → FAILED → RETRY_SCHEDULED → QUEUED
                                    → DEAD_LETTER
SCHEDULED → QUEUED (when available_at reached)
```

## Failure Recovery

1. Worker claims job with lease (`lease_expires_at`)
2. Worker extends lease during execution
3. If worker dies, lease expires
4. Recovery process moves job to RETRY_SCHEDULED or DLQ
5. Scheduler promotes retry-scheduled jobs when `available_at` reached
