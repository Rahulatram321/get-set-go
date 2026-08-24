import type { WebSocket } from 'ws';
import { WS_EVENTS } from '@orbitqueue/shared';

type WsClient = WebSocket & { projectId?: string; userId?: string };

class EventBus {
  private clients = new Set<WsClient>();

  addClient(client: WsClient) {
    this.clients.add(client);
  }

  removeClient(client: WsClient) {
    this.clients.delete(client);
  }

  broadcast(event: string, data: unknown, projectId?: string) {
    const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
    for (const client of this.clients) {
      if (client.readyState === 1) {
        if (!projectId || client.projectId === projectId) {
          client.send(message);
        }
      }
    }
  }

  emitJobCreated(projectId: string, job: unknown) {
    this.broadcast(WS_EVENTS.JOB_CREATED, job, projectId);
  }

  emitJobCompleted(projectId: string, job: unknown) {
    this.broadcast(WS_EVENTS.JOB_COMPLETED, job, projectId);
  }

  emitJobFailed(projectId: string, job: unknown) {
    this.broadcast(WS_EVENTS.JOB_FAILED, job, projectId);
  }

  emitWorkerOnline(worker: unknown) {
    this.broadcast(WS_EVENTS.WORKER_ONLINE, worker);
  }

  emitWorkerOffline(worker: unknown) {
    this.broadcast(WS_EVENTS.WORKER_OFFLINE, worker);
  }

  emitQueuePaused(projectId: string, queue: unknown) {
    this.broadcast(WS_EVENTS.QUEUE_PAUSED, queue, projectId);
  }

  emitQueueResumed(projectId: string, queue: unknown) {
    this.broadcast(WS_EVENTS.QUEUE_RESUMED, queue, projectId);
  }
}

export const eventBus = new EventBus();
