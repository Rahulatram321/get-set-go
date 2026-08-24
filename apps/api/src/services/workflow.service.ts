import type { PrismaClient } from '@orbitqueue/database';
import { NotFoundError, ConflictError } from '@orbitqueue/shared';
import { WorkflowEngine } from '@orbitqueue/queue-core';

export class WorkflowService {
  private readonly engine: WorkflowEngine;

  constructor(private readonly prisma: PrismaClient) {
    this.engine = new WorkflowEngine(prisma);
  }

  async create(
    projectId: string,
    input: {
      name: string;
      description?: string;
      nodes: Array<{
        name: string;
        jobName: string;
        queueName: string;
        payload: Record<string, unknown>;
        delayMs: number;
        dependsOn: string[];
      }>;
    }
  ) {
    const workflow = await this.prisma.$transaction(async (tx) => {
      const wf = await tx.workflow.create({
        data: { projectId, name: input.name, description: input.description, status: 'RUNNING' },
      });

      const nodeMap = new Map<string, string>();

      for (const node of input.nodes) {
        const created = await tx.workflowNode.create({
          data: {
            workflowId: wf.id,
            name: node.name,
            jobName: node.jobName,
            queueName: node.queueName,
            payload: node.payload as object,
            delayMs: node.delayMs,
            status: node.dependsOn.length === 0 ? 'READY' : 'PENDING',
          },
        });
        nodeMap.set(node.name, created.id);
      }

      for (const node of input.nodes) {
        const nodeId = nodeMap.get(node.name)!;
        for (const depName of node.dependsOn) {
          const depId = nodeMap.get(depName);
          if (!depId) throw new ConflictError(`Dependency node "${depName}" not found`);
          await tx.workflowDependency.create({
            data: { nodeId, dependsOnNodeId: depId },
          });
        }
      }

      return wf;
    });

    await this.enqueueReadyNodes(workflow.id, projectId);
    return this.getWorkflow(workflow.id, projectId);
  }

  async enqueueReadyNodes(workflowId: string, projectId: string) {
    const readyNodes = await this.prisma.workflowNode.findMany({
      where: { workflowId, status: 'READY', jobId: null },
      include: { workflow: true },
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

    const readyNodeIds = await this.engine.onNodeComplete(node.workflowId, node.id);
    if (readyNodeIds.length > 0) {
      await this.enqueueReadyNodes(node.workflowId, node.workflow.projectId);
    }

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

  async list(projectId: string) {
    return this.prisma.workflow.findMany({
      where: { projectId },
      include: {
        nodes: { include: { dependencies: true } },
        _count: { select: { jobs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getWorkflow(workflowId: string, projectId: string) {
    const wf = await this.prisma.workflow.findFirst({
      where: { id: workflowId, projectId },
      include: {
        nodes: {
          include: {
            dependencies: { include: { dependsOnNode: true } },
          },
        },
        jobs: { select: { id: true, name: true, status: true } },
      },
    });
    if (!wf) throw new NotFoundError('Workflow', workflowId);
    return wf;
  }
}
