// Trigger tasks (ADR-0010), API half: TC-73 … TC-78. The server runs with
// PUSH_OUTBOX, so pushes are lines in a file. The DB and the outbox are shared
// across specs: every case uses its own titles and fake endpoints.
import { test, expect, type APIRequestContext } from '@playwright/test';
import { ANNA, MATTHIAS, addDays, dbAll, today, uniq } from '../support/tasks.js';
import { outboxForTask, settle, subscribe, unsubscribe } from '../support/push.js';

// No identity on the request context: the hook must work without Remote-User.
test.use({ extraHTTPHeaders: {} });

const SECTIONS = ['faellig', 'demnaechst', 'spaeter', 'irgendwann'] as const;
const TRIGGER = { refire: 'PUSH' } as const;

async function create(request: APIRequestContext, body: object) {
  const res = await request.post('/api/tasks', { data: body, headers: MATTHIAS });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}
const patch = (request: APIRequestContext, id: number, data: object) =>
  request.patch(`/api/tasks/${id}`, { data, headers: MATTHIAS });
const act = (request: APIRequestContext, id: number, what: 'complete' | 'skip' | 'undo') =>
  request.post(`/api/tasks/${id}/${what}`, { headers: MATTHIAS });
async function home(request: APIRequestContext) {
  return (await (await request.get('/api/tasks', { headers: MATTHIAS })).json()).sections;
}
async function sectionOf(request: APIRequestContext, id: number): Promise<string | null> {
  const sections = await home(request);
  return SECTIONS.find((s) => sections[s].some((t: any) => t.id === id)) ?? null;
}
async function recurring(request: APIRequestContext) {
  return (await (await request.get('/api/recurring', { headers: MATTHIAS })).json()).tasks as any[];
}
async function token(request: APIRequestContext, id: number) {
  const res = await request.post(`/api/tasks/${id}/hook-token`, { headers: MATTHIAS });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as { token: string; url: string };
}
/** The hook, with a bearer (null = no Authorization header). Never sends Remote-User. */
const hook = (request: APIRequestContext, id: number | string, bearer: string | null) =>
  request.post(`/hooks/${id}`, { headers: bearer === null ? {} : { Authorization: `Bearer ${bearer}` } });
const row = (id: number) => dbAll('select * from Task where id = ?', id)[0];

test('TC-73 Anlegen: wartend, nicht auf Startseite, in /api/recurring, kein "Neue Aufgabe"-Push; Art-Regeln', async ({ request }) => {
  const aEp = await subscribe(request, ANNA);
  const title = uniq('ZZ-Trigger anlegen');
  const t = await create(request, { title, trigger: TRIGGER, notify: true });
  expect(t.trigger).toEqual({ refire: 'PUSH', hasToken: false, firedAt: null, after: null, fireAt: null });
  expect(t.dueDate).toBeNull();
  expect(t.recurrence).toBeNull();
  expect(t.notify).toBe(true);

  // not on home (not even in Irgendwann), but in Routinen
  expect(await sectionOf(request, t.id)).toBeNull();
  const listed = (await recurring(request)).find((x) => x.id === t.id);
  expect(listed.trigger.refire).toBe('PUSH');

  // a date sent along is ignored; refire defaults to PUSH
  const dated = await create(request, { title: uniq('ZZ-Trigger Datum'), trigger: {}, dueDate: today() });
  expect(dated.dueDate).toBeNull();
  expect(dated.trigger.refire).toBe('PUSH');
  expect(await sectionOf(request, dated.id)).toBeNull();

  // trigger + recurrence together -> 400
  const both = await request.post('/api/tasks', {
    data: { title: uniq('ZZ-Trigger beides'), trigger: TRIGGER, recurrence: { every: 1, unit: 'WEEK' } },
    headers: MATTHIAS,
  });
  expect(both.status()).toBe(400);
  expect((await request.post('/api/tasks', { data: { title: 'x', trigger: { refire: 'BOGUS' } }, headers: MATTHIAS })).status()).toBe(400);

  // creating pushes nothing, neither "Neue Aufgabe" nor "Jetzt fällig"
  await settle(300);
  expect(outboxForTask(aEp, t.id)).toHaveLength(0);
  expect(outboxForTask(aEp, dated.id)).toHaveLength(0);
  await unsubscribe(request, ANNA, aEp);
});

test('TC-74 Hook-Auth: Token, 401 überall gleich, Token ersetzen', async ({ request }) => {
  const a = await create(request, { title: uniq('ZZ-Trigger Auth A'), trigger: TRIGGER });
  const b = await create(request, { title: uniq('ZZ-Trigger Auth B'), trigger: TRIGGER });
  const oneOff = await create(request, { title: uniq('ZZ-Trigger Einmalig') });

  const ta = await token(request, a.id);
  expect(ta.token).toMatch(/^hh_[A-Za-z0-9_-]{43,}$/);
  expect(ta.url).toMatch(new RegExp(`/hooks/${a.id}$`));
  expect(ta.url.startsWith('http')).toBe(true);
  const tb = await token(request, b.id);

  // a one-off has no token
  expect((await request.post(`/api/tasks/${oneOff.id}/hook-token`, { headers: MATTHIAS })).status()).toBe(400);
  expect((await request.post('/api/tasks/999999/hook-token', { headers: MATTHIAS })).status()).toBe(404);
  // identity applies to the token endpoint
  expect((await request.post(`/api/tasks/${a.id}/hook-token`)).status()).toBe(401);

  // hasToken is true; neither token nor hash appears in any DTO or list
  const seen = JSON.stringify([
    await (await request.get(`/api/recurring`, { headers: MATTHIAS })).json(),
    await (await request.get(`/api/tasks`, { headers: MATTHIAS })).json(),
    await patch(request, a.id, { title: a.title }).then((r) => r.json()),
  ]);
  expect(seen).not.toContain(ta.token);
  expect(seen).not.toContain(tb.token);
  expect(seen).not.toContain(row(a.id).hookTokenHash);
  expect(row(a.id).hookTokenHash).not.toBe(ta.token);
  expect((await recurring(request)).find((x) => x.id === a.id).trigger.hasToken).toBe(true);

  // every failure is the same 401
  const failures = [
    await hook(request, a.id, null),
    await hook(request, a.id, 'hh_wrong'),
    await hook(request, a.id, tb.token), // another trigger task's token
    await hook(request, 999999, ta.token), // unknown id
    await hook(request, 'abc', ta.token),
    await hook(request, oneOff.id, ta.token), // not a trigger
    await request.post(`/hooks/${a.id}`, { headers: { Authorization: ta.token } }), // no "Bearer"
  ];
  for (const r of failures) {
    expect(r.status()).toBe(401);
    expect(await r.json()).toEqual({ error: 'Unauthorized' });
  }
  // nothing fired
  expect((await recurring(request)).find((x) => x.id === a.id).dueDate).toBeNull();

  // an archived trigger task answers 401 too
  const gone = await create(request, { title: uniq('ZZ-Trigger Archiv'), trigger: TRIGGER });
  const tg = await token(request, gone.id);
  expect((await request.delete(`/api/tasks/${gone.id}`, { headers: MATTHIAS })).status()).toBe(204);
  expect((await hook(request, gone.id, tg.token)).status()).toBe(401);

  // the right token works (no Remote-User on the request); replacing it kills the old one
  const ok = await hook(request, a.id, ta.token);
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toEqual({ taskId: a.id, result: 'fired' });
  const ta2 = await token(request, a.id);
  expect(ta2.token).not.toBe(ta.token);
  expect((await hook(request, a.id, ta.token)).status()).toBe(401);
  expect((await hook(request, a.id, ta2.token)).status()).toBe(200);
});

test('TC-75 Auslösen: fällig heute, Push an alle, ohne notify kein Push', async ({ request }) => {
  const mEp = await subscribe(request, MATTHIAS);
  const aEp = await subscribe(request, ANNA);

  const title = uniq('ZZ-Trigger Waschmaschine');
  const t = await create(request, { title, trigger: TRIGGER, notify: true });
  const { token: tok } = await token(request, t.id);
  const before = Date.now();
  const res = await hook(request, t.id, tok);
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ taskId: t.id, result: 'fired' });

  const fired = (await recurring(request)).find((x) => x.id === t.id);
  expect(fired.dueDate).toBe(today());
  expect(Date.parse(fired.trigger.firedAt)).toBeGreaterThanOrEqual(before - 2000);
  expect(await sectionOf(request, t.id)).toBe('faellig');
  expect(row(t.id).notifiedFor).toBe(today());

  for (const ep of [mEp, aEp]) {
    const pushes = outboxForTask(ep, t.id);
    expect(pushes).toHaveLength(1);
    expect(pushes[0].payload).toMatchObject({ title, body: 'Jetzt fällig', tag: `task-${t.id}` });
  }

  // without notify: fired, but silent
  const quiet = await create(request, { title: uniq('ZZ-Trigger leise'), trigger: TRIGGER, notify: false });
  const tq = await token(request, quiet.id);
  expect(await (await hook(request, quiet.id, tq.token)).json()).toMatchObject({ result: 'fired' });
  expect(await sectionOf(request, quiet.id)).toBe('faellig');
  await settle(400);
  expect(outboxForTask(mEp, quiet.id)).toHaveLength(0);
  expect(outboxForTask(aEp, quiet.id)).toHaveLength(0);

  await unsubscribe(request, MATTHIAS, mEp);
  await unsubscribe(request, ANNA, aEp);
});

test('TC-76 Nochmal auslösen: PUSH wiederholt (renotify), NONE ignoriert', async ({ request }) => {
  const mEp = await subscribe(request, MATTHIAS);
  const aEp = await subscribe(request, ANNA);

  const p = await create(request, { title: uniq('ZZ-Trigger Repush'), trigger: { refire: 'PUSH' }, notify: true });
  const tp = (await token(request, p.id)).token;
  expect((await (await hook(request, p.id, tp)).json()).result).toBe('fired');
  const first = (await recurring(request)).find((x) => x.id === p.id);
  await new Promise((r) => setTimeout(r, 20));
  const again = await hook(request, p.id, tp);
  expect(await again.json()).toEqual({ taskId: p.id, result: 'repushed' });
  const second = (await recurring(request)).find((x) => x.id === p.id);
  expect(second.dueDate).toBe(first.dueDate);
  expect(Date.parse(second.trigger.firedAt)).toBeGreaterThan(Date.parse(first.trigger.firedAt));
  for (const ep of [mEp, aEp]) {
    const pushes = outboxForTask(ep, p.id);
    expect(pushes).toHaveLength(2);
    expect(pushes[0].payload.renotify).toBeUndefined();
    expect(pushes[1].payload).toMatchObject({ body: 'Jetzt fällig', tag: `task-${p.id}`, renotify: true });
  }

  const n = await create(request, { title: uniq('ZZ-Trigger Still'), trigger: { refire: 'NONE' }, notify: true });
  const tn = (await token(request, n.id)).token;
  expect((await (await hook(request, n.id, tn)).json()).result).toBe('fired');
  const f1 = (await recurring(request)).find((x) => x.id === n.id);
  const ignored = await hook(request, n.id, tn);
  expect(ignored.status()).toBe(200);
  expect(await ignored.json()).toEqual({ taskId: n.id, result: 'ignored' });
  const f2 = (await recurring(request)).find((x) => x.id === n.id);
  expect(f2.trigger.firedAt).toBe(f1.trigger.firedAt);
  await settle(300);
  for (const ep of [mEp, aEp]) expect(outboxForTask(ep, n.id)).toHaveLength(1);

  await unsubscribe(request, MATTHIAS, mEp);
  await unsubscribe(request, ANNA, aEp);
});

test('TC-77 Abhaken, Überspringen, Rückgängig: zurück auf wartend', async ({ request }) => {
  const aEp = await subscribe(request, ANNA);
  const t = await create(request, { title: uniq('ZZ-Trigger Abhaken'), trigger: TRIGGER, notify: true });
  const tok = (await token(request, t.id)).token;

  // waiting: nothing to complete or skip
  expect((await act(request, t.id, 'complete')).status()).toBe(400);
  expect((await act(request, t.id, 'skip')).status()).toBe(400);

  await hook(request, t.id, tok);
  const done = await act(request, t.id, 'complete');
  expect(done.status()).toBe(200);
  const d = await done.json();
  expect(d.dueDate).toBeNull();
  expect(d.lastDone).toMatchObject({ date: today() });
  expect(d.trigger).not.toBeNull();
  expect(row(t.id).doneAt).toBeNull();
  expect(await sectionOf(request, t.id)).toBeNull();
  expect((await recurring(request)).some((x) => x.id === t.id)).toBe(true);
  expect(dbAll('select kind, dueDateBefore from Completion where taskId = ?', t.id)).toEqual([
    { kind: 'DONE', dueDateBefore: today() },
  ]);

  // fires again, and pushes again (a fresh fire, not a repeat)
  expect((await (await hook(request, t.id, tok)).json()).result).toBe('fired');
  expect(await sectionOf(request, t.id)).toBe('faellig');
  expect(outboxForTask(aEp, t.id)).toHaveLength(2);
  expect(outboxForTask(aEp, t.id)[1].payload.renotify).toBeUndefined();

  // skip: same, logged as SKIPPED
  const skipped = await act(request, t.id, 'skip');
  expect(skipped.status()).toBe(200);
  expect((await skipped.json()).dueDate).toBeNull();
  expect(dbAll('select kind from Completion where taskId = ? order by id', t.id).map((r) => r.kind)).toEqual(['DONE', 'SKIPPED']);

  // undo restores the fired date
  const undone = await act(request, t.id, 'undo');
  expect(undone.status()).toBe(200);
  expect((await undone.json()).dueDate).toBe(today());
  expect(await sectionOf(request, t.id)).toBe('faellig');

  // a trigger task is never "done"
  expect((await act(request, t.id, 'complete')).status()).toBe(200);
  expect(row(t.id).doneAt).toBeNull();
  await unsubscribe(request, ANNA, aEp);
});

test('TC-78 Art wechseln und erneutes Speichern', async ({ request }) => {
  const mEp = await subscribe(request, MATTHIAS);
  const aEp = await subscribe(request, ANNA);

  // one-off due tomorrow -> trigger: waiting
  const o = await create(request, { title: uniq('ZZ-Trigger Wechsel'), dueDate: addDays(today(), 1) });
  const toTrigger = await patch(request, o.id, { trigger: TRIGGER, dueDate: addDays(today(), 3) });
  expect(toTrigger.status()).toBe(200);
  const tt = await toTrigger.json();
  expect(tt.dueDate).toBeNull();
  expect(tt.trigger.refire).toBe('PUSH');
  expect(await sectionOf(request, o.id)).toBeNull();

  // recurring -> trigger: rule cleared, waiting
  const r = await create(request, { title: uniq('ZZ-Trigger Aus Routine'), recurrence: { every: 2, unit: 'WEEK' }, dueDate: today() });
  const rt = await (await patch(request, r.id, { trigger: TRIGGER })).json();
  expect(rt.recurrence).toBeNull();
  expect(rt.dueDate).toBeNull();
  expect(rt.trigger).not.toBeNull();
  expect(row(r.id).recurrenceEvery).toBeNull();

  // trigger + recurrence alone is a 400; with trigger: null it becomes recurring, due today
  const rec = { every: 1, unit: 'WEEK' };
  expect((await patch(request, r.id, { recurrence: rec })).status()).toBe(400);
  expect((await patch(request, r.id, { recurrence: rec, trigger: TRIGGER })).status()).toBe(400);
  const back = await patch(request, r.id, { recurrence: rec, trigger: null });
  expect(back.status()).toBe(200);
  const rb = await back.json();
  expect(rb.trigger).toBeNull();
  expect(rb.recurrence).toMatchObject({ every: 1, unit: 'WEEK' });
  expect(rb.dueDate).toBe(today());

  // trigger with token -> one-off: date kept (null = Irgendwann), the old token is dead for good
  const t = await create(request, { title: uniq('ZZ-Trigger Zurück'), trigger: TRIGGER, notify: true });
  const tok = (await token(request, t.id)).token;
  const oneOff = await (await patch(request, t.id, { trigger: null })).json();
  expect(oneOff.trigger).toBeNull();
  expect(oneOff.dueDate).toBeNull();
  expect(await sectionOf(request, t.id)).toBe('irgendwann');
  expect(row(t.id).hookTokenHash).toBeNull();
  expect((await hook(request, t.id, tok)).status()).toBe(401);
  await patch(request, t.id, { trigger: TRIGGER });
  expect((await hook(request, t.id, tok)).status()).toBe(401);
  expect((await recurring(request)).find((x) => x.id === t.id).trigger.hasToken).toBe(false);

  // a fired trigger task turned into a one-off keeps its date
  const tok2 = (await token(request, t.id)).token;
  await hook(request, t.id, tok2);
  const kept = await (await patch(request, t.id, { trigger: null })).json();
  expect(kept.dueDate).toBe(today());
  expect(kept.trigger).toBeNull();

  // resaving a trigger task with the full sheet payload changes nothing and pushes nothing
  const s = await create(request, { title: uniq('ZZ-Trigger Speichern'), trigger: TRIGGER, notify: true });
  const sheetPayload = (task: any) => ({
    title: task.title, notes: null, priority: task.priority, notify: task.notify, recurrence: null, trigger: { refire: task.trigger.refire },
  });
  const same = await (await patch(request, s.id, sheetPayload(s))).json();
  expect(same).toEqual(s);
  const stok = (await token(request, s.id)).token;
  await hook(request, s.id, stok);
  await settle(300);
  const pushesBefore = outboxForTask(aEp, s.id).length;
  expect(pushesBefore).toBe(1);
  const firedDto = (await recurring(request)).find((x) => x.id === s.id);
  const resaved = await (await patch(request, s.id, sheetPayload(firedDto))).json();
  expect(resaved.dueDate).toBe(today());
  expect(resaved.trigger.firedAt).toBe(firedDto.trigger.firedAt);
  await settle(500);
  expect(outboxForTask(aEp, s.id)).toHaveLength(pushesBefore);
  expect(outboxForTask(mEp, s.id)).toHaveLength(pushesBefore);

  await unsubscribe(request, MATTHIAS, mEp);
  await unsubscribe(request, ANNA, aEp);
});
