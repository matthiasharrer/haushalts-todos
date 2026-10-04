// Helpers for the push cases (ADR-0009). The server runs with PUSH_OUTBOX set,
// so every push it would send is a JSON line in that file. The DB and the
// outbox are shared across specs: always filter by your own endpoint.
import fs from 'node:fs';
import crypto from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { expect } from '@playwright/test';
import { PUSH_OUTBOX } from './paths.js';

export interface OutboxEntry {
  endpoint: string;
  payload: { title: string; body: string; tag: string; url: string };
}

export function outbox(endpoint: string): OutboxEntry[] {
  if (!fs.existsSync(PUSH_OUTBOX)) return [];
  return fs
    .readFileSync(PUSH_OUTBOX, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as OutboxEntry)
    .filter((e) => e.endpoint === endpoint);
}

/** Entries for one endpoint about one task (ignores digests and other tasks' pushes). */
export const outboxForTask = (endpoint: string, taskId: number) =>
  outbox(endpoint).filter((e) => e.payload.tag === `task-${taskId}`);

export const fakeEndpoint = () => `https://push.example.invalid/${crypto.randomBytes(8).toString('hex')}`;

/** Registers a fake device (the outbox transport never encrypts, so dummy keys do). */
export async function subscribe(
  request: APIRequestContext,
  headers: Record<string, string>,
  endpoint = fakeEndpoint(),
): Promise<string> {
  const res = await request.post('/api/push/subscriptions', {
    headers,
    data: { endpoint, keys: { p256dh: 'dummy-p256dh', auth: 'dummy-auth' } },
  });
  expect(res.status()).toBe(201);
  return endpoint;
}

export async function unsubscribe(
  request: APIRequestContext,
  headers: Record<string, string>,
  endpoint: string,
): Promise<void> {
  const res = await request.delete('/api/push/subscriptions', { headers, data: { endpoint } });
  expect(res.status()).toBe(204);
}

/** Lets any fire-and-forget work settle before asserting that something did NOT happen. */
export const settle = (ms = 1200) => new Promise((r) => setTimeout(r, ms));
