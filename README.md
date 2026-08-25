# Get Set Go

**Reliable background execution for modern systems.**

Get Set Go is a production-inspired distributed job scheduling platform built to demonstrate real distributed-systems engineering: atomic job claiming, worker coordination, lease-based recovery, retry engines, dead-letter queues, and full observability — across a multi-tenant, role-based backend and a live monitoring dashboard.

---

## Table of Contents

- [Overview](#overview)
- [Core Capabilities](#core-capabilities)
- [Architecture](#architecture)
- [Database Design](#database-design)
- [Job Lifecycle](#job-lifecycle)
- [Retry Strategy](#retry-strategy)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Access](#access)
- [Development Commands](#development-commands)
- [Project Structure](#project-structure)
- [Example Workflow](#example-workflow)
- [API Overview](#api-overview)
- [Testing](#testing)
- [Environment Variables](#environment-variables)
- [Bonus Features Implemented](#bonus-features-implemented)
- [Design Decisions](#design-decisions)
- [Evaluation Criteria Coverage](#evaluation-criteria-coverage)
- [Deliverables](#deliverables)
- [License](#license)

---

## Overview

Get Set Go lets teams create projects, configure job queues, and schedule immediate, delayed, cron-recurring, or batch jobs — all executed reliably by a pool of competing workers with atomic claiming, heartbeat-based health checks, lease recovery, and full retry/DLQ handling. Every job's execution history, logs, and metrics are tracked end-to-end and surfaced on a live dashboard.

The project was built to satisfy a full-stack distributed systems assignment spanning authentication, project/queue management, job scheduling, worker orchestration, database design, API design, and observability — evaluated on engineering quality over feature count.

## Core Capabilities

**Auth & Project Management**
- JWT-based authentication with organization- and project-level RBAC
- Each project can own multiple independent job queues

**Queue Configuration**
- Priority levels, per-queue concurrency limits
- Configurable retry policy (fixed / linear / exponential backoff with jitter)
- Pause/resume controls per queue
- Live queue statistics (throughput, backlog, failure rate)

**Job Types**
- Immediate jobs
- Delayed jobs (run-after timestamp)
- Scheduled jobs (run-at timestamp)
- Recurring jobs via cron expressions
- Batch job submission

**Worker Service**
- Polls queues and atomically claims jobs via `SELECT ... FOR UPDATE SKIP LOCKED` — no duplicate execution under concurrent load
- Executes jobs concurrently up to a configurable `WORKER_CONCURRENCY`
- Emits periodic heartbeats for health monitoring; unhealthy workers are auto-detected
- Supports graceful shutdown — in-flight jobs finish or are cleanly requeued before exit
- Orphaned jobs from crashed workers are recovered via lease expiry

**Reliability**
- Full job lifecycle tracking: `QUEUED → SCHEDULED → CLAIMED → RUNNING → COMPLETED / FAILED → RETRY / DLQ`
- Retry engine with fixed, linear, and exponential backoff + jitter
- Dead Letter Queue for permanent failures, with manual requeue support
- Execution logs, retry history, worker assignment, and timing metrics persisted per job

**Dashboard**
- Queue health, worker status, and job explorer
- Execution logs and retry history per job
- Queue configuration UI (priority, concurrency, retry policy, pause/resume)
- Real-time throughput and system-health charts via WebSocket/polling
- Command palette (⌘K) for fast navigation

## Architecture

```
Frontend (Next.js)
       ↓ REST + WebSocket
API (Fastify)
       ↓
PostgreSQL ← Scheduler (leader election via Redis)
       ↓
   Job Queue
       ↓ FOR UPDATE SKIP LOCKED
Workers (N processes)
       ↓
Execution → Metrics → Dashboard
```

- **API layer** — Fastify service handling auth, project/queue/job CRUD, pagination, filtering, and structured error handling.
- **Scheduler** — dedicated service resolving delayed/scheduled/recurring (cron) jobs into the queue, using Redis-based leader election so only one scheduler instance is active at a time.
- **Workers** — independent Node.js processes that poll, atomically claim, execute, retry, and heartbeat.
- **Redis** — distributed rate limiting, leader election, and cross-service coordination.
- **PostgreSQL** — system of record for all entities, with row-level locking for atomic claiming.

Detailed diagrams: `docs/architecture/system-overview.md`, `docs/database/er-diagram.md`.

## Database Design

Core entities and relationships (see `docs/database/index-strategy.md` for full schema, indexes, and cascade rules):

| Entity | Purpose |
|---|---|
| `Users` | Account credentials, roles |
| `Organizations` | Top-level tenant boundary |
| `Projects` | Belongs to an Organization; owns Queues |
| `Queues` | Priority, concurrency limit, retry policy, pause state, stats |
| `Jobs` | Payload, queue reference, status, priority, scheduling metadata |
| `JobExecutions` | One row per execution attempt: worker, timestamps, result |
| `RetryPolicies` | Strategy type (fixed/linear/exponential), base delay, max attempts, jitter config |
| `Workers` | Registered worker instances and their state |
| `WorkerHeartbeats` | Periodic liveness pings per worker |
| `JobLogs` | Structured execution log lines per job |
| `ScheduledJobs` | Cron/delayed/recurring job definitions resolved by the Scheduler |
| `DeadLetterQueueEntries` | Permanently failed jobs with original payload and failure reason |

Design notes:
- Foreign keys cascade from `Organization → Project → Queue → Job → JobExecution/JobLog` so tenant deletion cleans up dependent data.
- Composite indexes on `(queue_id, status, priority, scheduled_at)` support efficient atomic claiming under `FOR UPDATE SKIP LOCKED`.
- `JobExecutions` and `JobLogs` are kept separate from `Jobs` (rather than denormalized) to keep the hot `Jobs` table narrow and fast to scan/claim, while preserving full historical detail.
- `WorkerHeartbeats` is a rolling table (latest-per-worker) to keep health checks O(1) rather than scanning history.

## Job Lifecycle

```
QUEUED → SCHEDULED → CLAIMED → RUNNING → COMPLETED
                                   ↓
                                 FAILED → RETRY → CLAIMED (retry loop)
                                   ↓
                                  DLQ (after max attempts)
```

- `SCHEDULED` applies to delayed, scheduled, and recurring jobs awaiting their run time.
- `CLAIMED → RUNNING` transitions atomically per worker to guarantee exactly-once claiming.
- Failures route through the retry engine until `RetryPolicy.max_attempts` is exhausted, after which the job moves to the Dead Letter Queue with full failure context and can be manually requeued from the dashboard.

## Retry Strategy

Configurable per queue via `RetryPolicies`:

| Strategy | Behavior |
|---|---|
| Fixed | Constant delay between attempts |
| Linear | Delay increases linearly with attempt count |
| Exponential | Delay doubles (or scales) per attempt, with jitter to avoid thundering-herd retries |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TypeScript, TailwindCSS, TanStack Query, Recharts |
| API | Fastify, Zod, JWT Auth |
| Worker | Node.js, dedicated worker processes |
| Scheduler | Node.js with Redis leader election |
| Database | PostgreSQL, Prisma ORM |
| Cache/Coordination | Redis |
| Testing | Vitest |
| Infrastructure | Docker Compose, Turbo monorepo |

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

### One-Command Startup

```bash
git clone <repo>
cd Job-portal-Assi
cp .env.example .env
docker compose up --build -d
```

### Local Development

```bash
cp .env.example .env
pnpm install
docker compose up postgres redis -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Access

| Service | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| API | http://localhost:3001 |
| API Docs | http://localhost:3001/docs |
| Metrics | http://localhost:3001/metrics |

Demo login: `admin@get-set-go.dev` / `password123`

## Development Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start all services in dev mode
pnpm build            # Build all packages
pnpm lint             # Lint all packages
pnpm typecheck        # TypeScript check
pnpm test             # Run unit tests
pnpm db:migrate       # Run database migrations
pnpm db:seed          # Seed demo data
pnpm demo             # Start demo job generator
pnpm docker:up        # Start Docker services
pnpm docker:down      # Stop Docker services
pnpm clean            # Clean build artifacts
```

## Project Structure

```
apps/
  web/          Next.js dashboard
  api/          Fastify REST API + WebSockets
  worker/       Distributed job worker
  scheduler/    Cron/recurring job scheduler
packages/
  database/     Prisma schema & client
  queue-core/   JobClaimer, retry engine, locks
  shared/       Types, errors, constants
  config/       Environment validation
  logger/       Pino structured logging
  validation/   Zod schemas
  metrics/      Prometheus metrics registry
docs/
  architecture/ System design & diagrams
  database/     Index strategy & ER diagram
  decisions/    Architecture Decision Records
tests/
  concurrency/  Atomic claiming concurrency test
```

## Example Workflow

```bash
# 1. Login
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@get-set-go.dev","password":"password123"}'

# 2. Create a job
curl -X POST http://localhost:3001/projects/{projectId}/jobs \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"queue":"email","name":"send-welcome-email","payload":{"email":"user@example.com"}}'

# 3. Watch it process in the dashboard at http://localhost:3000
```

## API Overview

Full reference: `http://localhost:3001/docs` (OpenAPI/Swagger).

- **Auth** — login, refresh, RBAC-scoped tokens
- **Projects** — create/list/update projects within an organization
- **Queues** — create/update queue config (priority, concurrency, retry policy), pause/resume, stats
- **Jobs** — create immediate/delayed/scheduled/recurring/batch jobs; list with pagination & filtering; retry/requeue from DLQ
- **Workers** — list worker status and heartbeats
- **Metrics** — Prometheus-formatted metrics endpoint

All endpoints use Zod-validated request/response schemas, JWT auth guards, and structured, consistent error responses.

## Testing

```bash
# Unit tests
pnpm --filter @get-set-go/queue-core test

# Concurrency test (requires PostgreSQL)
DATABASE_URL=postgresql://get-set-go:get-set-go@localhost:5432/get-set-go \
  pnpm vitest run tests/concurrency/

# Load test
tsx scripts/load-test.ts
```

The concurrency suite specifically verifies that concurrent workers competing for the same queue never double-claim a job (`FOR UPDATE SKIP LOCKED` correctness).

## Environment Variables

See `.env.example` for all configuration options.

Key variables:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `JWT_SECRET` — JWT signing secret (min 16 chars)
- `WORKER_CONCURRENCY` — Max concurrent jobs per worker

## Bonus Features Implemented

- ✅ Rate limiting (Redis-based, per queue)
- ✅ Distributed locking (leader election for Scheduler, atomic claim locking for Workers)
- ✅ WebSocket live updates
- ✅ Role-based access control (org/project level)
- ⬜ Workflow dependencies
- ⬜ Queue sharding
- ⬜ Event-driven execution
- ⬜ AI-generated failure summaries

## Design Decisions

See `docs/decisions/` for full Architecture Decision Records. Highlights:
- **Atomic claiming via `FOR UPDATE SKIP LOCKED`** over a distributed lock service — simpler operationally, and PostgreSQL already sits in the critical path as the system of record.
- **Separate Scheduler service** rather than cron logic inside workers — keeps recurring/delayed job resolution single-instance (via Redis leader election) and decoupled from execution scaling.
- **Execution history in a dedicated `JobExecutions`/`JobLogs` table** rather than mutating the `Jobs` row — keeps the hot path narrow while preserving full audit history.

## Evaluation Criteria Coverage

| Criteria | Marks | Where it's covered |
|---|---|---|
| System Architecture | 20 | [Architecture](#architecture) — Fastify API, Scheduler with leader election, N worker processes, Redis coordination |
| Database Design | 20 | [Database Design](#database-design) — full entity table, indexing, cascade, normalization notes |
| Backend Engineering | 20 | [API Overview](#api-overview), [Core Capabilities](#core-capabilities) — auth, queue config, job CRUD, validation |
| Reliability & Concurrency | 15 | [Job Lifecycle](#job-lifecycle), [Retry Strategy](#retry-strategy), atomic claiming, lease recovery, DLQ |
| Frontend & UX | 10 | [Core Capabilities → Dashboard](#core-capabilities) — queue health, job explorer, logs, config UI, live charts |
| API Design | 5 | [API Overview](#api-overview) — REST, pagination, filtering, structured errors, OpenAPI docs |
| Documentation | 5 | This README + `docs/architecture/`, `docs/database/`, `docs/decisions/` |
| Testing | 5 | [Testing](#testing) — unit tests, concurrency test, load test |

## Deliverables

- Source code with setup instructions (this repo)
- Architecture diagram — `docs/architecture/system-overview.md`
- ER diagram — `docs/database/er-diagram.md`
- API documentation — `http://localhost:3001/docs`
- Design decisions document — `docs/decisions/`
- Automated tests for critical functionality — `tests/`

## License

MIT — see `LICENSE`
