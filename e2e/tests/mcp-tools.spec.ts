// MCP tools: TC-47 (same semantics as REST), TC-48 (get_task history),
// TC-49 (settings: own clients only, rename, revoke).
import { test, expect, type APIRequestContext } from '@playwright/test';
import { ANNA, MATTHIAS, MONTH_NAMES, addDays, dbAll, farSeason, nextMonthStart, today, uniq } from '../support/tasks.js';
import { MCP_TOKEN } from '../support/paths.js';
import { callJson, callTool, postMcp, runOAuthFlow, textOf, type OAuthResult } from '../support/mcpClient.js';

test.use({ extraHTTPHeaders: {} });

const SECTIONS = ['faellig', 'demnaechst', 'spaeter', 'irgendwann'] as const;
let m: OAuthResult;
let mName: string;

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3201' });
  mName = uniq('tools');
  m = await runOAuthFlow(request, mName, MATTHIAS);
  await request.dispose();
});

const rest = async (request: APIRequestContext, path: string) =>
  (await request.get(path, { headers: MATTHIAS })).json();

test('TC-47 list_tasks / list_recurring entsprechen der REST-API; Zusatzfelder auf Deutsch', async ({ request }) => {
  const a = uniq('Liste überfällig');
  const created = await callJson(request, m.accessToken, 'add_task', {
    title: a,
    due_date: addDays(today(), -3),
    recurrence: { every: 2, unit: 'WEEK' },
  });
  await callJson(request, m.accessToken, 'add_task', { title: uniq('Liste ohne Datum'), priority: 'HIGH' });

  const viaTool = await callJson(request, m.accessToken, 'list_tasks', {});
  const viaRest = await rest(request, '/api/tasks');
  expect(viaTool.today).toBe(viaRest.today);
  for (const s of SECTIONS) {
    expect(viaTool.sections[s].map((t: any) => t.id)).toEqual(viaRest.sections[s].map((t: any) => t.id));
  }
  const mine = viaTool.sections.faellig.find((t: any) => t.id === created.id);
  expect(mine.dueDate).toBe(addDays(today(), -3));
  expect(mine.dueLabel).toBe('seit 3 Tagen');
  expect(mine.recurrenceLabel).toContain('alle 2 Wochen');

  const recTool = await callJson(request, m.accessToken, 'list_recurring', {});
  const recRest = await rest(request, '/api/recurring');
  expect(recTool.tasks.map((t: any) => t.id)).toEqual(recRest.tasks.map((t: any) => t.id));
});

test('TC-47 search_tasks: Groß-/Kleinschreibung und Umlaute egal, nur aktive Aufgaben', async ({ request }) => {
  const tag = String(Date.now());
  const w = await callJson(request, m.accessToken, 'add_task', { title: `Waschmaschine reinigen ${tag}` });
  const k = await callJson(request, m.accessToken, 'add_task', { title: `Kühlschrank abtauen ${tag}` });
  const n = await callJson(request, m.accessToken, 'add_task', { title: `Etwas ${tag}`, notes: 'Im Keller: SPÜLMITTEL' });
  const ids = (r: any) => r.tasks.map((t: any) => t.id);

  expect(ids(await callJson(request, m.accessToken, 'search_tasks', { query: `waschmaschine` }))).toContain(w.id);
  expect(ids(await callJson(request, m.accessToken, 'search_tasks', { query: `WASCHMASCHINE reinigen ${tag}` }))).toEqual([w.id]);
  expect(ids(await callJson(request, m.accessToken, 'search_tasks', { query: `kuhlschrank` }))).toContain(k.id);
  expect(ids(await callJson(request, m.accessToken, 'search_tasks', { query: `KÜHLSCHRANK abtauen ${tag}` }))).toEqual([k.id]);
  expect(ids(await callJson(request, m.accessToken, 'search_tasks', { query: 'spulmittel' }))).toContain(n.id);

  // done one-offs and archived ones are not found
  await callJson(request, m.accessToken, 'complete_task', { id: w.id });
  await callJson(request, m.accessToken, 'archive_task', { id: k.id });
  expect(ids(await callJson(request, m.accessToken, 'search_tasks', { query: `waschmaschine reinigen ${tag}` }))).toEqual([]);
  expect(ids(await callJson(request, m.accessToken, 'search_tasks', { query: `kuhlschrank abtauen ${tag}` }))).toEqual([]);

  const empty = await callTool(request, m.accessToken, 'search_tasks', { query: '  ' });
  expect(empty.isError).toBe(true);
});

test('TC-47 complete/skip/undo/update/archive haben dieselbe Semantik wie REST', async ({ request }) => {
  const t = today();
  // one-off: complete with a back-dated day, undo restores
  const one = await callJson(request, m.accessToken, 'add_task', { title: uniq('Einmalig') });
  await callJson(request, m.accessToken, 'complete_task', { id: one.id, date: addDays(t, -1) });
  const restOne = await rest(request, '/api/tasks');
  expect(SECTIONS.flatMap((s) => restOne.sections[s]).some((x: any) => x.id === one.id)).toBe(false); // done one-off leaves the list
  expect(dbAll('select date from Completion where taskId = ?', one.id)[0].date).toBe(addDays(t, -1));
  await callJson(request, m.accessToken, 'undo_last', { id: one.id });
  expect((await callTool(request, m.accessToken, 'undo_last', { id: one.id })).isError).toBe(true); // nothing left

  // recurring AFTER_COMPLETION: due moves from the completion day; skip moves it too; undo reverts
  const rec = await callJson(request, m.accessToken, 'add_task', {
    title: uniq('Wöchentlich'),
    due_date: addDays(t, -2),
    recurrence: { every: 1, unit: 'WEEK' },
  });
  const done = await callJson(request, m.accessToken, 'complete_task', { id: rec.id });
  expect(done.dueDate).toBe(addDays(t, 7));
  expect(done.lastDone.date).toBe(t);
  const skipped = await callJson(request, m.accessToken, 'skip_task', { id: rec.id });
  expect(skipped.dueDate).toBe(addDays(t, 7)); // skip counts from today (AFTER_COMPLETION), like REST
  await callJson(request, m.accessToken, 'undo_last', { id: rec.id });
  const back = await rest(request, '/api/recurring');
  expect(back.tasks.find((x: any) => x.id === rec.id).dueDate).toBe(addDays(t, 7));

  // the same sequence through REST gives the same dates
  const rr = await (
    await request.post('/api/tasks', {
      headers: MATTHIAS,
      data: { title: uniq('REST'), dueDate: addDays(t, -2), recurrence: { every: 1, unit: 'WEEK' } },
    })
  ).json();
  await request.post(`/api/tasks/${rr.id}/complete`, { headers: MATTHIAS });
  const rs = await (await request.post(`/api/tasks/${rr.id}/skip`, { headers: MATTHIAS })).json();
  expect(rs.dueDate).toBe(skipped.dueDate);

  // skip on a one-off: error
  const skipOne = await callTool(request, m.accessToken, 'skip_task', { id: (await callJson(request, m.accessToken, 'add_task', { title: uniq('x') })).id });
  expect(skipOne.isError).toBe(true);
  expect(textOf(skipOne)).toContain('wiederkehrende');

  // future date refused
  const fut = await callTool(request, m.accessToken, 'complete_task', { id: rec.id, date: addDays(t, 1) });
  expect(fut.isError).toBe(true);
  expect(textOf(fut)).toContain('Zukunft');

  // update: partial, nullable fields, convert one-off -> recurring and back
  const u = await callJson(request, m.accessToken, 'update_task', { id: one.id, title: 'Neu ' + one.id, notes: 'N', priority: 'HIGH', due_date: addDays(t, 3) });
  expect(u).toMatchObject({ title: 'Neu ' + one.id, notes: 'N', priority: 'HIGH', dueDate: addDays(t, 3), dueLabel: 'in 3 Tagen' });
  const u2 = await callJson(request, m.accessToken, 'update_task', { id: one.id, notes: null, due_date: null });
  expect(u2).toMatchObject({ notes: null, dueDate: null });
  const u3 = await callJson(request, m.accessToken, 'update_task', { id: one.id, recurrence: { every: 3, unit: 'DAY' } });
  expect(u3.recurrence).toEqual({ every: 3, unit: 'DAY', mode: 'AFTER_COMPLETION', season: null });
  expect(u3.dueDate).toBe(t); // a recurring task always has a date
  const bad = await callTool(request, m.accessToken, 'update_task', { id: one.id, due_date: null });
  expect(bad.isError).toBe(true);

  // archive
  const arch = await callJson(request, m.accessToken, 'archive_task', { id: one.id });
  expect(arch).toEqual({ archived: true, id: one.id });
  expect(dbAll('select archivedAt from Task where id = ?', one.id)[0].archivedAt).not.toBeNull();
  expect((await callTool(request, m.accessToken, 'archive_task', { id: one.id })).isError).toBe(true);
});

test('TC-47 Fehler sind Tool-Ergebnisse (isError, deutsch), keine Protokollfehler', async ({ request }) => {
  for (const [name, args] of [
    ['get_task', { id: 999999 }],
    ['complete_task', { id: 999999 }],
    ['update_task', { id: 999999, title: 'x' }],
    ['skip_task', { id: 999999 }],
    ['undo_last', { id: 999999 }],
    ['archive_task', { id: 999999 }],
    ['add_task', { title: '' }],
    ['add_task', { title: 'x', due_date: '2026-02-30' }],
    ['add_task', { title: 'x', priority: 'URGENT' }],
    ['add_task', {}],
    ['complete_task', { id: 'abc' }],
    ['complete_task', { id: 1, date: 'gestern' }],
  ] as const) {
    const r = await callTool(request, m.accessToken, name, args as any);
    expect(r.isError, `${name} ${JSON.stringify(args)}`).toBe(true);
    expect(textOf(r).length).toBeGreaterThan(5);
  }
  expect(textOf(await callTool(request, m.accessToken, 'get_task', { id: 999999 }))).toContain('gibt es nicht');
});

test('TC-48 get_task: Aufgabe + Verlauf (neueste zuerst, max. 20) mit Datum, Art, Person, via', async ({ request }) => {
  const b = await runOAuthFlow(request, uniq('hist anna'), ANNA);
  const rec = await callJson(request, m.accessToken, 'add_task', { title: uniq('Verlauf'), recurrence: { every: 1, unit: 'DAY' } });
  await callJson(request, m.accessToken, 'complete_task', { id: rec.id, date: addDays(today(), -1) });
  await callJson(request, b.accessToken, 'skip_task', { id: rec.id });
  await callJson(request, b.accessToken, 'complete_task', { id: rec.id });

  const g = await callJson(request, m.accessToken, 'get_task', { id: rec.id });
  expect(g.task.id).toBe(rec.id);
  expect(g.history.map((h: any) => h.kind)).toEqual(['DONE', 'SKIPPED', 'DONE']);
  expect(g.history[0]).toMatchObject({ date: today(), by: { displayName: expect.stringMatching(/^Anna/) } });
  expect(g.history[0].via).toMatch(/^mcp:hist anna/);
  expect(g.history[2]).toMatchObject({ date: addDays(today(), -1), via: `mcp:${mName}` });
  expect(g.history[2].by.displayName).toMatch(/^Matthias/);
  expect(g.history[2].dateLabel).toBe('gestern');

  // cap at 20
  const many = await callJson(request, m.accessToken, 'add_task', { title: uniq('Viele'), recurrence: { every: 1, unit: 'DAY' } });
  for (let i = 0; i < 23; i++) await callJson(request, m.accessToken, 'complete_task', { id: many.id });
  const g2 = await callJson(request, m.accessToken, 'get_task', { id: many.id });
  expect(g2.history).toHaveLength(20);
  // via the web too
  const web = await request.post(`/api/tasks/${rec.id}/skip`, { headers: MATTHIAS });
  expect(web.ok()).toBe(true);
  const g3 = await callJson(request, m.accessToken, 'get_task', { id: rec.id });
  expect(g3.history[0]).toMatchObject({ kind: 'SKIPPED', via: 'web' });
});

test('TC-49 Einstellungen-API: nur eigene Clients; Umbenennen; Trennen wirkt sofort; kein MCP_TOKEN in Antworten', async ({
  request,
}) => {
  const nameA = uniq('settings matthias');
  const nameB = uniq('settings anna');
  const a = await runOAuthFlow(request, nameA, MATTHIAS);
  const b = await runOAuthFlow(request, nameB, ANNA);

  const cfg = await request.get('/api/mcp/config', { headers: MATTHIAS });
  expect(await cfg.json()).toEqual({ configured: true, endpoint: '/mcp' });

  const mine = await (await request.get('/api/mcp/clients', { headers: MATTHIAS })).json();
  expect(mine.map((c: any) => c.name)).toContain(nameA);
  expect(mine.map((c: any) => c.name)).not.toContain(nameB);
  const entry = mine.find((c: any) => c.name === nameA);
  expect(Object.keys(entry).sort()).toEqual(['createdAt', 'id', 'lastUsedAt', 'name']);
  expect(entry.lastUsedAt).not.toBeNull(); // a token was issued
  const hers = (await (await request.get('/api/mcp/clients', { headers: ANNA })).json()).find((c: any) => c.name === nameB);

  // not visible, not renamable, not revocable across users: 404, and nothing changed
  expect((await request.patch(`/api/mcp/clients/${hers.id}`, { data: { name: 'hack' }, headers: MATTHIAS })).status()).toBe(404);
  expect((await request.delete(`/api/mcp/clients/${hers.id}`, { headers: MATTHIAS })).status()).toBe(404);
  expect((await postMcp(request, b.accessToken, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status()).toBe(200);
  expect(dbAll('select name from McpClient where id = ?', hers.id)[0].name).toBe(nameB);
  // no identity -> 401
  expect((await request.get('/api/mcp/clients')).status()).toBe(401);

  // rename (trimmed; empty rejected)
  const ren = await request.patch(`/api/mcp/clients/${entry.id}`, { data: { name: '  Umbenannt ' }, headers: MATTHIAS });
  expect((await ren.json()).name).toBe('Umbenannt');
  expect((await request.patch(`/api/mcp/clients/${entry.id}`, { data: { name: '  ' }, headers: MATTHIAS })).status()).toBe(400);

  // every response above is free of the signing secret
  for (const body of [JSON.stringify(mine), await cfg.text(), await ren.text()]) expect(body).not.toContain(MCP_TOKEN);

  // revoke: the access token fails at once, the refresh token is invalid_grant
  expect((await postMcp(request, a.accessToken, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status()).toBe(200);
  expect((await request.delete(`/api/mcp/clients/${entry.id}`, { headers: MATTHIAS })).status()).toBe(204);
  expect((await postMcp(request, a.accessToken, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status()).toBe(401);
  const refresh = await request.post('/mcp/token', { form: { grant_type: 'refresh_token', refresh_token: a.refreshToken, client_id: a.clientId } });
  expect(refresh.status()).toBe(400);
  expect((await refresh.json()).error).toBe('invalid_grant');
  expect((await request.delete(`/api/mcp/clients/${entry.id}`, { headers: MATTHIAS })).status()).toBe(404);
});

test('TC-56 seasonal chores via MCP: season in/out, label, resting, German errors', async ({ request }) => {
  const season = farSeason();
  const label = season.from === season.to ? MONTH_NAMES[season.from - 1] : `${MONTH_NAMES[season.from - 1]}–${MONTH_NAMES[season.to - 1]}`;
  const t = await callJson(request, m.accessToken, 'add_task', {
    title: uniq('Rasen mcp'),
    recurrence: { every: 2, unit: 'WEEK', season },
  });
  expect(t.recurrence.season).toEqual(season);
  expect(t.recurrenceLabel).toContain(`alle 2 Wochen, ${label}`);
  expect(t.resting).toBe(true);
  expect(t.dueDate).toBe(nextMonthStart(today(), season.from));

  const rec = await callJson(request, m.accessToken, 'list_recurring', {});
  const mine = rec.tasks.find((x: any) => x.id === t.id);
  expect(mine.resting).toBe(true);
  expect(mine.recurrenceLabel).toContain(label);
  const got = await callJson(request, m.accessToken, 'get_task', { id: t.id });
  expect(got.task.resting).toBe(true);
  expect(got.task.recurrenceLabel).toContain(label);

  const bad = await callTool(request, m.accessToken, 'update_task', {
    id: t.id,
    recurrence: { every: 2, unit: 'WEEK', season: { from: 0, to: 13 } },
  });
  expect(bad.isError).toBe(true);
  expect(textOf(bad)).toContain('Ungültige Eingabe');

  const cleared = await callJson(request, m.accessToken, 'update_task', {
    id: t.id,
    recurrence: { every: 2, unit: 'WEEK', season: null },
  });
  expect(cleared.recurrence.season).toBeNull();
  expect(cleared.recurrenceLabel).not.toContain(label);
  expect(cleared.resting).toBe(false);
});
