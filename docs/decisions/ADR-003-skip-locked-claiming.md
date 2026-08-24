# ADR-003: SKIP LOCKED for Atomic Claiming

## Context
Multiple workers poll the same queue simultaneously. SELECT-then-UPDATE patterns cause duplicate execution.

## Decision
Use `SELECT ... FOR UPDATE SKIP LOCKED` within a transaction, immediately followed by status update to CLAIMED.

## Alternatives
- Optimistic locking with version column
- Redis LPOP (loses relational job metadata)
- Advisory locks

## Trade-offs
- (+) Proven PostgreSQL pattern, no external dependency for claiming
- (+) Skips locked rows instead of blocking
- (-) Raw SQL required for SKIP LOCKED (Prisma doesn't support it natively)

## Consequences
JobClaimer abstraction encapsulates this in `packages/queue-core`. Concurrency test validates no duplicate claims with 10 workers and 100 jobs.
