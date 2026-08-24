import type { PrismaClient } from '@orbitqueue/database';
import { WorkflowEngine } from './job-lifecycle.js';

export class WorkflowRunner {
  private readonly engine: WorkflowEngine;

  constructor(private readonly prisma: PrismaClient) {
    this.engine = new WorkflowEngine(prisma);
  }

  async onJobCompleted(jobId: string) {
    const node = await this.prisma.workflowNode.findFirst({
      where: { jobId },
      include: { workflow: true },
    });
    if (!node) return;

    await this.prisma.workflowNode.update({
      where: { id: node.id },
      data: { status: 'COMPLETED' },
    });

    await this.engine.onNodeComplete(node.workflowId, node.id);
    await this.enqueueReadyNodes(node.workflowId, node.workflow.projectId);

    const pending = await this.prisma.workflowNode.count({
      where: { workflowId: node.workflowId, status: { notIn: ['COMPLETED', 'SKIPPED'] } },
    });
    if (pending === 0) {
      await this.prisma.workflow.update({
        where: { id: node.workflowId },
        data: { status: 'COMPLETED' },
      });
    }
  }

  async onJobFailed(jobId: string) {
    const node = await this.prisma.workflowNode.findFirst({ where: { jobId } });
    if (!node) return;

    await this.prisma.workflowNode.update({
      where: { id: node.id },
      data: { status: 'FAILED' },
    });
    await this.prisma.workflow.update({
      where: { id: node.workflowId },
      data: { status: 'FAILED' },
    });
  }

  async enqueueReadyNodes(workflowId: string, projectId: string) {
    const readyNodes = await this.prisma.workflowNode.findMany({
      where: { workflowId, status: 'READY', jobId: null },
    });

    for (const node of readyNodes) {
      const queue = await this.prisma.queue.findFirst({
        where: { projectId, name: node.queueName },
      });
      if (!queue) continue;

      const availableAt = new Date(Date.now() + node.delayMs);

      const job = await this.prisma.job.create({
        data: {
          projectId,
          queueId: queue.id,
          name: node.jobName,
          payload: node.payload as object,
          workflowId,
          scheduleType: 'WORKFLOW',
          status: node.delayMs > 0 ? 'SCHEDULED' : 'QUEUED',
          availableAt,
          scheduledAt: node.delayMs > 0 ? availableAt : null,
        },
      });

      await this.prisma.workflowNode.update({
        where: { id: node.id },
        data: { status: 'RUNNING', jobId: job.id },
      });
    }
  }
}
