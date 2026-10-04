// TC-61: the push sender (ADR-0009) with a fake transport; no DB, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { outboxTransport, sendToSubscriptions, type PushPayload, type PushSub, type SenderDeps } from './push.js';

const payload: PushPayload = { title: 'T', body: 'B', tag: 'x', url: '/' };
const sub = (id: number): PushSub => ({ id, endpoint: `https://push.example.invalid/${id}`, p256dh: 'p', auth: 'a' });

function harness(failures: Record<number, number | undefined>) {
  const sent: number[] = [];
  const gone: number[] = [];
  const ok: number[] = [];
  const logs: string[] = [];
  const deps: SenderDeps = {
    transport: async (s) => {
      if (s.id in failures) throw Object.assign(new Error('boom'), { statusCode: failures[s.id] });
      sent.push(s.id);
    },
    onGone: async (s) => void gone.push(s.id),
    onSuccess: async (s) => void ok.push(s.id),
    log: (m) => void logs.push(m),
  };
  return { deps, sent, gone, ok, logs };
}

test('TC-61 410 and 404 delete the subscription', async () => {
  const h = harness({ 1: 410, 2: 404 });
  await sendToSubscriptions([sub(1), sub(2)], payload, h.deps);
  assert.deepEqual(h.gone, [1, 2]);
  assert.deepEqual(h.ok, []);
});

test('TC-61 a 500 is logged and the row kept', async () => {
  const h = harness({ 1: 500 });
  await sendToSubscriptions([sub(1)], payload, h.deps);
  assert.deepEqual(h.gone, []);
  assert.equal(h.logs.length, 1);
});

test('TC-61 one failing device does not stop the others; success is recorded', async () => {
  const h = harness({ 2: 500, 3: 410, 5: undefined });
  await sendToSubscriptions([sub(1), sub(2), sub(3), sub(4), sub(5)], payload, h.deps);
  assert.deepEqual(h.sent, [1, 4]);
  assert.deepEqual(h.ok, [1, 4]);
  assert.deepEqual(h.gone, [3]);
});

test('the outbox transport appends one JSON line per send and needs no valid keys', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'outbox-')), 'out.jsonl');
  const send = outboxTransport(file);
  await send(sub(1), payload);
  await send(sub(2), { ...payload, tag: 'y' });
  const lines = fs.readFileSync(file, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines[0], { endpoint: sub(1).endpoint, payload });
  assert.equal(lines[1].payload.tag, 'y');
});
