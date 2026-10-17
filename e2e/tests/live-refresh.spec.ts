// TC-103…104: the list picks up changes made elsewhere (the other person, MCP,
// a trigger) when the app returns to the foreground and while it stays open.
import { test, expect, type Page } from '@playwright/test';
import { ANNA, today, uniq } from '../support/tasks.js';

const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title });

test('TC-103 Zurück in den Vordergrund: Aufgabe von Anna erscheint ohne Neuladen', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Haushalt', level: 1 })).toBeVisible();
  const title = uniq('Vordergrund');
  const res = await request.post('/api/tasks', { data: { title, dueDate: today() }, headers: ANNA });
  expect(res.status()).toBe(201);
  await expect(row(page, title)).toHaveCount(0);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(row(page, title)).toBeVisible();
});

test('TC-104 Offen und sichtbar: nach 30 s ist die Änderung da', async ({ page, request }) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Haushalt', level: 1 })).toBeVisible();
  const title = uniq('Abfrage');
  const res = await request.post('/api/tasks', { data: { title, dueDate: today() }, headers: ANNA });
  expect(res.status()).toBe(201);
  await page.clock.runFor(29_000);
  await expect(row(page, title)).toHaveCount(0);
  await page.clock.runFor(2_000);
  await expect(row(page, title)).toBeVisible();
});
