import { test, expect } from '@playwright/test';

// Bare headers per test: these cases set identity themselves.
test.use({ extraHTTPHeaders: {} });

test('TC-01 /api/health works without identity', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect((await res.json()).status).toBe('ok');
});

test('TC-02 /api/me ohne Remote-User -> 401', async ({ request }) => {
  const res = await request.get('/api/me');
  expect(res.status()).toBe(401);
  expect(await res.json()).toHaveProperty('error');
});

test('TC-03 /api/me mit Remote-User liefert den Benutzer; Änderungen werden übernommen', async ({
  request,
}) => {
  const a = await request.get('/api/me', {
    headers: { 'Remote-User': 'matthias', 'Remote-Name': 'Matthias', 'Remote-Email': 'm@example.invalid' },
  });
  expect(a.status()).toBe(200);
  const first = await a.json();
  expect(first).toMatchObject({ username: 'matthias', displayName: 'Matthias', email: 'm@example.invalid' });

  const b = await request.get('/api/me', {
    headers: { 'Remote-User': 'matthias', 'Remote-Name': 'Matthias H.' },
  });
  const second = await b.json();
  expect(second.id).toBe(first.id);
  expect(second.displayName).toBe('Matthias H.');
  expect(second.email).toBeNull();
});

test('TC-04 zweiter Benutzer (anna) bekommt eine eigene Zeile', async ({ request }) => {
  const m = await (
    await request.get('/api/me', { headers: { 'Remote-User': 'matthias', 'Remote-Name': 'Matthias' } })
  ).json();
  const a = await (
    await request.get('/api/me', { headers: { 'Remote-User': 'anna', 'Remote-Name': 'Anna' } })
  ).json();
  expect(a.username).toBe('anna');
  expect(a.id).not.toBe(m.id);
});
