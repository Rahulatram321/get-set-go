# ADR-001: PostgreSQL for Durable Job State

## Context
Job state must survive process restarts and support ACID transactions for atomic claiming.

## Decision
Use PostgreSQL as the primary job state store with Prisma ORM.

## Alternatives
- Redis-only queues (BullMQ): fast but less durable query capabilities
- DynamoDB: good scale but complex transaction patterns

## Trade-offs
- (+) ACID transactions, SKIP LOCKED, rich querying
- (-) Higher latency than pure in-memory queues

## Consequences
Atomic claiming is implemented via PostgreSQL row locks. All state transitions are transactional.
