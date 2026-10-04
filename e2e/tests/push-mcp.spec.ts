// TC-70: MCP and push (ADR-0009): `notify` on add_task / update_task, shown by
// get_task and the list tools; add_task of a one-off pushes to the other user.
import { test, expect } from '@playwright/test';
import { ANNA, MATTHIAS, today, uniq } from '../support/tasks.js';
import { callJson, runOAuthFlow } from '../support/mcpClient.js';
import { outboxForTask, settle, subscribe, unsubscribe } from '../support/push.js';

test.use({ extraHTTPHeaders: {} });

test('TC-70 MCP: notify setzen, ändern, sehen; Push an die andere Person', async ({ request }) => {
  const mcp = await runOAuthFlow(request, uniq('push70'), MATTHIAS);
  const mEp = await subscribe(request, MATTHIAS);
  const aEp = await subscribe(request, ANNA);
  const call = (name: string, args: Record<string, unknown>) => callJson(request, mcp.accessToken, name, args);

  // a one-off pushes to Anna like in TC-64; notify is off by default
  const plain = await call('add_task', { title: uniq('MCP einfach') });
  expect(plain.notify).toBe(false);
  expect(outboxForTask(aEp, plain.id)).toHaveLength(1);
  expect(outboxForTask(aEp, plain.id)[0].payload.title).toMatch(/^Neue Aufgabe von /);
  expect(outboxForTask(mEp, plain.id)).toHaveLength(0);

  // notify + due today: the due-now push replaces the "new" one
  const hot = await call('add_task', { title: uniq('MCP Waschmaschine'), notify: true, due_date: today() });
  expect(hot.notify).toBe(true);
  const hotPushes = outboxForTask(aEp, hot.id);
  expect(hotPushes).toHaveLength(1);
  expect(hotPushes[0].payload.body).toBe('Jetzt fällig');

  // update_task flips notify; get_task and list tools show it
  const flipped = await call('update_task', { id: plain.id, notify: true });
  expect(flipped.notify).toBe(true);
  expect((await call('get_task', { id: plain.id })).task.notify).toBe(true);
  const listed = await call('search_tasks', { query: hot.title });
  expect(listed.tasks.find((t: any) => t.id === hot.id).notify).toBe(true);
  const home = await call('list_tasks', {});
  expect(home.sections.faellig.find((t: any) => t.id === hot.id).notify).toBe(true);
  await call('update_task', { id: plain.id, notify: false });
  expect((await call('get_task', { id: plain.id })).task.notify).toBe(false);

  await settle(300);
  expect(outboxForTask(aEp, hot.id)).toHaveLength(1);
  await unsubscribe(request, MATTHIAS, mEp);
  await unsubscribe(request, ANNA, aEp);
});
