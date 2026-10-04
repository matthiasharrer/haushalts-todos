// Push notifications (ADR-0009), API half: TC-62 … TC-67. The server runs with
// PUSH_OUTBOX, so pushes are lines in a file and nothing leaves the machine.
// The DB and the outbox are shared across specs: every case uses its own fake
// endpoints and only looks at those.
import { test, expect } from '@playwright/test';
import { ANNA, MATTHIAS, addDays, dbAll, today, uniq } from '../support/tasks.js';
import { fakeEndpoint, outbox, outboxForTask, settle, subscribe, unsubscribe } from '../support/push.js';
import { runOAuthFlow, callJson } from '../support/mcpClient.js';

test.use({ extraHTTPHeaders: {} });

const post = (request: any, headers: Record<string, string>, path: string, data: unknown) =>
  request.post(path, { headers, data });

test('TC-62 Abo-API: config, anlegen, auf anna umhängen, löschen, ungültige Eingaben', async ({ request }) => {
  const a = await (await request.get('/api/push/config', { headers: MATTHIAS })).json();
  expect(a.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
  const b = await (await request.get('/api/push/config', { headers: ANNA })).json();
  expect(b.publicKey).toBe(a.publicKey);

  const endpoint = fakeEndpoint();
  await subscribe(request, MATTHIAS, endpoint);
  const m = await (await request.get('/api/me', { headers: MATTHIAS })).json();
  const an = await (await request.get('/api/me', { headers: ANNA })).json();
  const rows = () => dbAll('select userId from PushSubscription where endpoint = ?', endpoint);
  expect(rows()).toEqual([{ userId: m.id }]);

  // same phone, other person: reassigned, still one row
  await subscribe(request, ANNA, endpoint);
  expect(rows()).toEqual([{ userId: an.id }]);

  // not mine -> deleting is a no-op for matthias
  expect((await request.delete('/api/push/subscriptions', { headers: MATTHIAS, data: { endpoint } })).status()).toBe(204);
  expect(rows()).toHaveLength(1);
  await unsubscribe(request, ANNA, endpoint);
  expect(rows()).toHaveLength(0);

  // invalid
  const keys = { p256dh: 'x', auth: 'y' };
  expect((await post(request, MATTHIAS, '/api/push/subscriptions', { endpoint: fakeEndpoint() })).status()).toBe(400);
  expect((await post(request, MATTHIAS, '/api/push/subscriptions', { endpoint: fakeEndpoint(), keys: { p256dh: 'x' } })).status()).toBe(400);
  expect((await post(request, MATTHIAS, '/api/push/subscriptions', { endpoint: fakeEndpoint(), keys: { p256dh: '', auth: 'y' } })).status()).toBe(400);
  expect((await post(request, MATTHIAS, '/api/push/subscriptions', { endpoint: 'http://push.example.invalid/x', keys })).status()).toBe(400);
  expect((await post(request, MATTHIAS, '/api/push/subscriptions', { endpoint: 'nonsense', keys })).status()).toBe(400);
  // identity applies
  expect((await request.get('/api/push/config')).status()).toBe(401);
});

test('TC-63 Einstellungen: Standardwerte, PATCH /api/me, ungültige Zeiten, Anna unabhängig', async ({ request }) => {
  const get = async (h: Record<string, string>) => (await request.get('/api/me', { headers: h })).json();
  const before = await get(MATTHIAS);
  expect(before).toMatchObject({ digestEnabled: true, notifyTime: '08:00' });

  const res = await request.patch('/api/me', { headers: MATTHIAS, data: { digestEnabled: false, notifyTime: '07:30' } });
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ digestEnabled: false, notifyTime: '07:30' });
  expect(await get(MATTHIAS)).toMatchObject({ digestEnabled: false, notifyTime: '07:30' });
  expect(await get(ANNA)).toMatchObject({ digestEnabled: true, notifyTime: '08:00' });

  for (const notifyTime of ['24:00', '7:30', 'abc', '12:60']) {
    const bad = await request.patch('/api/me', { headers: MATTHIAS, data: { notifyTime } });
    expect(bad.status(), notifyTime).toBe(400);
  }
  expect((await request.patch('/api/me', { headers: MATTHIAS, data: { digestEnabled: 'yes' } })).status()).toBe(400);
  expect(await get(MATTHIAS)).toMatchObject({ digestEnabled: false, notifyTime: '07:30' });

  await request.patch('/api/me', { headers: MATTHIAS, data: { digestEnabled: true, notifyTime: '08:00' } });
});

test('TC-64 neue einmalige Aufgabe geht an die anderen, nie an den Ersteller; Serien nicht; MCP ja', async ({ request }) => {
  const mEp = await subscribe(request, MATTHIAS);
  const aEp = await subscribe(request, ANNA);

  const title = uniq('Milch kaufen');
  const created = await (await post(request, MATTHIAS, '/api/tasks', { title })).json();
  const toAnna = outboxForTask(aEp, created.id);
  expect(toAnna).toHaveLength(1);
  expect(toAnna[0].payload.title).toMatch(/^Neue Aufgabe von Matthias/);
  expect(toAnna[0].payload.body).toBe(title);
  expect(toAnna[0].payload.url).toBe('/');
  expect(outboxForTask(mEp, created.id)).toHaveLength(0);

  const fromAnna = await (await post(request, ANNA, '/api/tasks', { title: uniq('Brot kaufen') })).json();
  expect(outboxForTask(mEp, fromAnna.id)).toHaveLength(1);
  expect(outboxForTask(mEp, fromAnna.id)[0].payload.title).toMatch(/^Neue Aufgabe von Anna/);
  expect(outboxForTask(aEp, fromAnna.id)).toHaveLength(0);

  const chore = await (
    await post(request, MATTHIAS, '/api/tasks', { title: uniq('Bad putzen'), recurrence: { every: 1, unit: 'WEEK' } })
  ).json();
  await settle(300);
  expect(outboxForTask(aEp, chore.id)).toHaveLength(0);

  // via MCP as Matthias
  const mcp = await runOAuthFlow(request, uniq('push64'), MATTHIAS);
  const viaMcp = await callJson(request, mcp.accessToken, 'add_task', { title: uniq('Per Claude') });
  expect(outboxForTask(aEp, viaMcp.id)).toHaveLength(1);
  expect(outboxForTask(mEp, viaMcp.id)).toHaveLength(0);

  await unsubscribe(request, MATTHIAS, mEp);
  await unsubscribe(request, ANNA, aEp);
});

test('TC-65 „Jetzt fällig“: einmal pro Fälligkeitsdatum, nur an die anderen, nie bei Erledigen/Rückgängig', async ({ request }) => {
  const mEp = await subscribe(request, MATTHIAS);
  const aEp = await subscribe(request, ANNA);
  const t = today();
  const create = async (data: Record<string, unknown>) => (await post(request, MATTHIAS, '/api/tasks', data)).json();
  const patch = async (id: number, data: Record<string, unknown>) =>
    request.patch(`/api/tasks/${id}`, { headers: MATTHIAS, data });
  const toAnna = (id: number) => outboxForTask(aEp, id);

  // recurring chore with notify, due today -> one push
  const chore = await create({ title: uniq('Waschmaschine'), notify: true, dueDate: t, recurrence: { every: 1, unit: 'WEEK' } });
  expect(chore.notify).toBe(true);
  expect(toAnna(chore.id)).toHaveLength(1);
  expect(toAnna(chore.id)[0].payload).toMatchObject({ title: chore.title, body: 'Jetzt fällig', tag: `task-${chore.id}` });
  expect(outboxForTask(mEp, chore.id)).toHaveLength(0);

  // one-off with notify, due today -> only the due-now push, not the "new" one
  const oneOff = await create({ title: uniq('Trockner'), notify: true, dueDate: t });
  expect(toAnna(oneOff.id)).toHaveLength(1);
  expect(toAnna(oneOff.id)[0].payload.body).toBe('Jetzt fällig');

  // notify but due tomorrow -> nothing; moving it to today -> one; resaving the whole sheet -> nothing more
  const later = await create({ title: uniq('Morgen'), notify: true, dueDate: addDays(t, 1), recurrence: { every: 1, unit: 'WEEK' } });
  await settle(300);
  expect(toAnna(later.id)).toHaveLength(0);
  expect((await patch(later.id, { dueDate: t })).status()).toBe(200);
  expect(toAnna(later.id)).toHaveLength(1);
  const sheet = { title: later.title, notes: null, priority: 'NORMAL', notify: true, dueDate: t, recurrence: { every: 1, unit: 'WEEK', mode: 'AFTER_COMPLETION', season: null } };
  expect((await patch(later.id, sheet)).status()).toBe(200);
  expect((await patch(later.id, sheet)).status()).toBe(200);
  await settle(300);
  expect(toAnna(later.id)).toHaveLength(1);

  // switching notify on for a task already due today -> one push
  const plain = await create({ title: uniq('Spülmaschine'), dueDate: t, recurrence: { every: 1, unit: 'WEEK' } });
  await settle(300);
  expect(toAnna(plain.id)).toHaveLength(0);
  await patch(plain.id, { notify: true });
  expect(toAnna(plain.id)).toHaveLength(1);

  // complete, undo: never a push
  for (const id of [oneOff.id, later.id, plain.id]) {
    expect((await post(request, MATTHIAS, `/api/tasks/${id}/complete`, {})).status()).toBe(200);
    expect((await post(request, MATTHIAS, `/api/tasks/${id}/undo`, undefined)).status()).toBe(200);
  }
  await settle(600);
  for (const id of [chore.id, oneOff.id, later.id, plain.id]) {
    expect(toAnna(id), `task ${id}`).toHaveLength(1);
    expect(outboxForTask(mEp, id)).toHaveLength(0);
  }

  await unsubscribe(request, MATTHIAS, mEp);
  await unsubscribe(request, ANNA, aEp);
});

test('TC-66 Test-Push geht nur an das eigene Gerät', async ({ request }) => {
  const mEp = await subscribe(request, MATTHIAS);
  const other = await subscribe(request, MATTHIAS);

  expect((await post(request, ANNA, '/api/push/test', { endpoint: mEp })).status()).toBe(404);
  expect((await post(request, MATTHIAS, '/api/push/test', { endpoint: fakeEndpoint() })).status()).toBe(404);
  expect(outbox(mEp)).toHaveLength(0);

  expect((await post(request, MATTHIAS, '/api/push/test', { endpoint: mEp })).status()).toBe(204);
  const sent = outbox(mEp);
  expect(sent).toHaveLength(1);
  expect(sent[0].payload).toMatchObject({ title: 'Test-Benachrichtigung', body: 'Push funktioniert.' });
  expect(outbox(other)).toHaveLength(0);

  await unsubscribe(request, MATTHIAS, mEp);
  await unsubscribe(request, MATTHIAS, other);
});

test('TC-67 der Scheduler läuft: genau eine Übersicht pro Tag, auch nach vielen Ticks', async ({ request }) => {
  const aEp = await subscribe(request, ANNA);
  // the DB is shared: the digest lists whatever is due, so assert only on its shape
  await post(request, MATTHIAS, '/api/tasks', { title: uniq('Fällig für die Übersicht'), dueDate: today() });

  const set = (data: Record<string, unknown>) => request.patch('/api/me', { headers: ANNA, data });
  expect((await set({ digestEnabled: true, notifyTime: '00:00' })).status()).toBe(200);

  const digests = () => outbox(aEp).filter((e) => e.payload.tag === 'digest');
  await expect.poll(() => digests().length, { timeout: 10_000 }).toBe(1);
  expect(digests()[0].payload.title).toMatch(/^\d+ Aufgaben? fällig$/);
  await settle(2500); // ~5 more ticks
  expect(digests()).toHaveLength(1);

  // clean up so other specs see Anna's defaults (no device left, so re-arming sends nothing)
  await unsubscribe(request, ANNA, aEp);
  expect((await set({ digestEnabled: true, notifyTime: '08:00' })).status()).toBe(200);
});
