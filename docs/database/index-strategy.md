# Index Strategy

## jobs table

| Index | Columns | Purpose |
|-------|---------|---------|
| jobs_queue_id_status_idx | (queue_id, status) | Queue dashboard status counts |
| jobs_queue_id_available_at_idx | (queue_id, available_at) | Worker polling ready jobs per queue |
| jobs_status_available_at_idx | (status, available_at) | Scheduler promoting scheduled jobs |
| jobs_priority_idx | (priority) | Priority ordering within claim query |
| jobs_created_at_idx | (created_at) | Job explorer default sort |
| jobs_batch_id_idx | (batch_id) | Batch progress tracking |
| jobs_worker_id_idx | (worker_id) | Worker job assignment lookup |

### Claim Query Pattern
```sql
SELECT j.id, j.queue_id FROM jobs j
INNER JOIN queues q ON q.id = j.queue_id
WHERE j.queue_id = ANY($1)
  AND j.status IN ('QUEUED', 'RETRY_SCHEDULED')
  AND j.available_at <= NOW()
  AND q.status = 'ACTIVE'
ORDER BY j.priority ASC, j.available_at ASC, j.created_at ASC
FOR UPDATE OF j SKIP LOCKED
LIMIT $2
```

The composite index on `(queue_id, status)` plus `(queue_id, available_at)` supports this query efficiently.

## job_executions

| Index | Columns | Purpose |
|-------|---------|---------|
| job_executions_job_id_idx | (job_id) | Execution history per job |

## scheduled_jobs

| Index | Columns | Purpose |
|-------|---------|---------|
| scheduled_jobs_next_run_at_enabled_idx | (next_run_at, enabled) | Scheduler tick query |

## worker_heartbeats

| Index | Columns | Purpose |
|-------|---------|---------|
| worker_heartbeats_worker_id_timestamp_idx | (worker_id, timestamp) | Heartbeat history charts |

## dead_letter_jobs

| Index | Columns | Purpose |
|-------|---------|---------|
| dead_letter_jobs_queue_id_idx | (queue_id) | DLQ per queue |
| dead_letter_jobs_failed_at_idx | (failed_at) | DLQ timeline sort |

## Data Retention

- Completed jobs: retained per queue `retentionDays` (default 30)
- Idempotency records: expire after 24 hours
- Worker heartbeats: recommend periodic cleanup of records older than 7 days
- Queue metrics: aggregate older data, keep raw for 30 days
