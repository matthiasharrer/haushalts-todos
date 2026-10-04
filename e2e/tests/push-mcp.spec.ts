// TC-70: MCP and push (ADR-0009): `notify` on add_task / update_task, shown by
// get_task and the list tools; add_task of a one-off pushes to the other user.
// TC-81: trigger tasks over MCP (ADR-0010).
import { test, expect } from '@playwright/test';
import { ANNA, MATTHIAS, today, uniq } from '../support/tasks.js';
import { callJson, callTool, runOAuthFlow, textOf } from '../support/mcpClient.js';
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

test('TC-81 MCP: Auslöser-Aufgabe anlegen, in list_recurring sehen, zur einmaligen machen; nie ein Token', async ({ request }) => {
  const mcp = await runOAuthFlow(request, uniq('trigger81'), MATTHIAS);
  const aEp = await subscribe(request, ANNA);
  const call = (name: string, args: Record<string, unknown>) => callJson(request, mcp.accessToken, name, args);
  const outputs: string[] = [];
  const seen = async (name: string, args: Record<string, unknown>) => {
    const out = await call(name, args);
    outputs.push(JSON.stringify(out));
    return out;
  };

  const title = uniq('MCP Wäsche aufhängen');
  const created = await seen('add_task', { title, trigger: { refire: 'PUSH' }, notify: true });
  expect(created.trigger).toEqual({ refire: 'PUSH', hasToken: false, firedAt: null });
  expect(created.dueDate).toBeNull();
  expect(created.triggerLabel).toBe('Auslöser · wartet');

  // not on home, but in list_recurring and search_tasks
  const home = await seen('list_tasks', {});
  expect(JSON.stringify(home)).not.toContain(title);
  const recurring = await seen('list_recurring', {});
  const listed = recurring.tasks.find((t: any) => t.id === created.id);
  expect(listed.triggerLabel).toBe('Auslöser · wartet');
  expect((await seen('search_tasks', { query: title })).tasks.map((t: any) => t.id)).toEqual([created.id]);

  // the web side issues a token; MCP output still never shows it or its hash
  const issued = await (await request.post(`/api/tasks/${created.id}/hook-token`, { headers: MATTHIAS })).json();
  const detail = await seen('get_task', { id: created.id });
  expect(detail.task.trigger.hasToken).toBe(true);
  await seen('update_task', { id: created.id, trigger: { refire: 'NONE' } });
  expect((await seen('get_task', { id: created.id })).task.trigger.refire).toBe('NONE');

  // trigger + recurrence: a German error
  const bad = await callTool(request, mcp.accessToken, 'update_task', {
    id: created.id,
    recurrence: { every: 1, unit: 'WEEK' },
  });
  expect(bad.isError).toBe(true);
  expect(textOf(bad)).toContain('nicht gleichzeitig');
  // completing a waiting one: a German error
  const nothing = await callTool(request, mcp.accessToken, 'complete_task', { id: created.id });
  expect(nothing.isError).toBe(true);
  expect(textOf(nothing)).toContain('wartet noch');

  // fired: shown as such, and on home
  await request.post(`/hooks/${created.id}`, { headers: { Authorization: `Bearer ${issued.token}` } });
  const fired = (await seen('list_recurring', {})).tasks.find((t: any) => t.id === created.id);
  expect(fired.triggerLabel).toBe('Auslöser · ausgelöst heute');
  expect((await seen('list_tasks', {})).sections.faellig.map((t: any) => t.id)).toContain(created.id);

  // trigger: null -> a one-off; the token no longer works
  const oneOff = await seen('update_task', { id: created.id, trigger: null });
  expect(oneOff.trigger).toBeNull();
  expect(oneOff.triggerLabel).toBeNull();
  const after = await request.post(`/hooks/${created.id}`, { headers: { Authorization: `Bearer ${issued.token}` } });
  expect(after.status()).toBe(401);

  const all = outputs.join('\n');
  expect(all).not.toContain(issued.token);
  expect(all).not.toContain('hh_');
  expect(all).not.toMatch(/hookTokenHash|[0-9a-f]{64}/);

  // creating it sent no "Neue Aufgabe" to Anna (the fire itself pushed "Jetzt fällig" once)
  const pushes = outboxForTask(aEp, created.id);
  expect(pushes.map((p) => p.payload.body)).toEqual(['Jetzt fällig']);
  await unsubscribe(request, ANNA, aEp);
});
