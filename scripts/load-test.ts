#!/usr/bin/env tsx
/**
 * Simple load test script for OrbitQueue
 * Usage: tsx scripts/load-test.ts
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

async function login(): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@orbitqueue.dev', password: 'password123' }),
  });
  const data = await res.json();
  return data.data.accessToken;
}

async function getProjectId(token: string): Promise<string> {
  const orgs = await fetch(`${API_URL}/organizations`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  const projects = await fetch(`${API_URL}/organizations/${orgs.data[0].id}/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  return projects.data[0].id;
}

async function main() {
  console.log('OrbitQueue Load Test');
  console.log('====================');

  const token = await login();
  const projectId = await getProjectId(token);
  const JOB_COUNT = 1000;

  console.log(`Creating ${JOB_COUNT} jobs...`);
  const createStart = Date.now();
  const batchSize = 50;

  for (let i = 0; i < JOB_COUNT; i += batchSize) {
    const jobs = Array.from({ length: Math.min(batchSize, JOB_COUNT - i) }, (_, j) => ({
      name: 'health-check',
      payload: { index: i + j },
    }));

    await fetch(`${API_URL}/projects/${projectId}/jobs/batch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ queue: 'analytics', jobs }),
    });
  }

  const createDuration = Date.now() - createStart;
  console.log(`Created ${JOB_COUNT} jobs in ${createDuration}ms`);
  console.log(`Creation throughput: ${((JOB_COUNT / createDuration) * 1000).toFixed(1)} jobs/sec`);

  console.log('\nWaiting for processing...');
  await new Promise((r) => setTimeout(r, 30000));

  const jobs = await fetch(`${API_URL}/projects/${projectId}/jobs?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  const completed = (jobs.data as Array<{ status: string }>).filter((j) => j.status === 'COMPLETED').length;
  console.log(`Completed (sample): ${completed}/100`);
  console.log('\nSee docs/performance/load-test.md for full results template.');
}

main().catch(console.error);
