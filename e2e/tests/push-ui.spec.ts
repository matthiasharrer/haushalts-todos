// Push notifications (ADR-0009), browser half: TC-68 (PWA shell) and TC-69
// (Settings card + task sheet), at the phone viewport. The subscribe flow
// itself needs a real push service and is eyes-only (TC-71).
import { test, expect } from '@playwright/test';
import { MATTHIAS, today, uniq } from '../support/tasks.js';

test('TC-68 PWA-Hülle: Manifest, Icons, Service Worker ohne fetch-Handler', async ({ page, request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/json|manifest/);
  expect(res.headers()['cache-control']).toBe('no-cache');
  const manifest = await res.json();
  expect(manifest).toMatchObject({ name: 'Haushalt', short_name: 'Haushalt', display: 'standalone', start_url: '/' });
  const purposes = manifest.icons.map((i: any) => `${i.sizes}:${i.purpose}`);
  expect(purposes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
  for (const icon of manifest.icons) {
    const img = await request.get(icon.src);
    expect(img.status(), icon.src).toBe(200);
    expect(img.headers()['content-type']).toBe('image/png');
    const bytes = await img.body();
    expect([...bytes.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]); // PNG magic
  }

  const sw = await request.get('/sw.js');
  expect(sw.status()).toBe(200);
  expect(sw.headers()['content-type']).toMatch(/javascript/);
  expect(sw.headers()['cache-control']).toBe('no-cache');
  const source = await sw.text();
  expect(source).not.toMatch(/addEventListener\(\s*['"]fetch['"]/);
  expect(source).toMatch(/addEventListener\(\s*['"]push['"]/);
  expect(source).toMatch(/addEventListener\(\s*['"]notificationclick['"]/);

  await page.goto('/');
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toMatch(/\/$/);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
});

test('TC-69 Einstellungen: Benachrichtigungen-Karte; Übersicht und Uhrzeit bleiben nach Reload', async ({ page, request }) => {
  await page.goto('/#/einstellungen');
  const card = page.getByRole('region', { name: 'Benachrichtigungen' });
  await expect(card).toBeVisible();
  await expect(card.getByText('Auf diesem Gerät')).toBeVisible();
  const digest = card.getByRole('checkbox', { name: 'Tägliche Übersicht' });
  const time = card.getByLabel('Uhrzeit');
  await expect(digest).toBeChecked();
  await expect(time).toHaveValue('08:00');

  // above the MCP card
  const cardY = (await card.boundingBox())!.y;
  const mcpY = (await page.getByRole('region', { name: 'Claude verbinden' }).boundingBox())!.y;
  expect(cardY).toBeLessThan(mcpY);

  // targets >= 44 px, no horizontal scroll
  for (const el of [digest.locator('xpath=ancestor::label'), time]) {
    expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  try {
    await digest.uncheck();
    await time.fill('07:15');
    await expect
      .poll(async () => (await (await request.get('/api/me', { headers: MATTHIAS })).json()).notifyTime)
      .toBe('07:15');
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Tägliche Übersicht' })).not.toBeChecked();
    await expect(page.getByLabel('Uhrzeit')).toHaveValue('07:15');
  } finally {
    await request.patch('/api/me', { headers: MATTHIAS, data: { digestEnabled: true, notifyTime: '08:00' } });
  }
});

test('TC-69 Aufgaben-Sheet: „Benachrichtigen, wenn fällig“ speichern, Glocke in der Zeile, wieder offen', async ({ page, request }) => {
  const title = uniq('Glocke');
  const res = await request.post('/api/tasks', { data: { title, dueDate: today() }, headers: MATTHIAS });
  expect(res.status()).toBe(201);

  await page.goto('/');
  const row = page.getByRole('listitem').filter({ hasText: title });
  await expect(row.getByRole('img', { name: 'benachrichtigt' })).toHaveCount(0);

  await row.getByRole('button', { name: `Bearbeiten: ${title}` }).click();
  const dlg = page.getByRole('dialog', { name: 'Aufgabe bearbeiten' });
  const toggle = dlg.getByRole('checkbox', { name: /Benachrichtigen, wenn fällig/ });
  await expect(toggle).not.toBeChecked();
  expect((await toggle.locator('xpath=ancestor::label').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await toggle.check();
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  await expect(dlg).toHaveCount(0);

  await expect(row.getByRole('img', { name: 'benachrichtigt' })).toBeVisible();
  await row.getByRole('button', { name: `Bearbeiten: ${title}` }).click();
  await expect(page.getByRole('dialog').getByRole('checkbox', { name: /Benachrichtigen, wenn fällig/ })).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
