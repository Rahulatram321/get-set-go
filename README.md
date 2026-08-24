# OrbitQueue

**Reliable background execution for modern systems.**

OrbitQueue is a production-inspired distributed job scheduling platform demonstrating real distributed systems engineering: atomic job claiming, worker coordination, lease-based recovery, retry engines, dead-letter queues, and observability.

![Architecture](docs/architecture/system.mmd)

## Features

- **Distributed Job Processing** — Multiple workers compete for jobs using PostgreSQL `FOR UPDATE SKIP LOCKED`
- **Atomic Job Claiming** — No duplicate execution under concurrent worker load
- **Job Lifecycle Management** — QUEUED → CLAIMED → RUNNING → COMPLETED/FAILED → RETRY/DLQ
- **Retry Engine** — Fixed, linear, and exponential backoff with jitter
- **Dead Letter Queue** — Permanent failure handling with requeue support
- **Worker Heartbeats** — Health monitoring with automatic unhealthy detection
- **Lease Recovery** — Orphaned jobs recovered when workers crash
- **Scheduler Service** — Cron, recurring, and delayed job support with leader election
- **Rate Limiting** — Redis-based distributed rate limiting per queue
- **RBAC** — Organization and project-level role-based access control
- **Real-time Updates** — WebSocket event streaming
- **Observability** — Prometheus metrics, structured logging, dashboard charts
- **Command Palette** — ⌘K developer-tool navigation

## Tech Stack

| Layer | Technology |
|-------|-----------|
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

Or for local development:

```bash
cp .env.example .env
pnpm install
docker compose up postgres redis -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

### Access

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:3000 |
| API | http://localhost:3001 |
| API Docs | http://localhost:3001/docs |
| Metrics | http://localhost:3001/metrics |

**Demo login:** `admin@orbitqueue.dev` / `password123`

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

See [docs/architecture/system-overview.md](docs/architecture/system-overview.md) for detailed documentation.

## Example Workflow

```bash
# 1. Login
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@orbitqueue.dev","password":"password123"}'

# 2. Create a job
curl -X POST http://localhost:3001/projects/{projectId}/jobs \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"queue":"email","name":"send-welcome-email","payload":{"email":"user@example.com"}}'

# 3. Watch it process in the dashboard at http://localhost:3000
```

## Testing

```bash
# Unit tests
pnpm --filter @orbitqueue/queue-core test

# Concurrency test (requires PostgreSQL)
DATABASE_URL=postgresql://orbitqueue:orbitqueue@localhost:5432/orbitqueue \
  pnpm vitest run tests/concurrency/

# Load test
tsx scripts/load-test.ts
```

## Environment Variables

See [.env.example](.env.example) for all configuration options.

Key variables:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `JWT_SECRET` — JWT signing secret (min 16 chars)
- `WORKER_CONCURRENCY` — Max concurrent jobs per worker

## License

MIT — see [LICENSE](LICENSE)
