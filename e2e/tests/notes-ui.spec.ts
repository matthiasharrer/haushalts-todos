// Readable notes, TC-83…TC-85, at the configured phone viewport (390×844).
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { MATTHIAS, uniq } from '../support/tasks.js';

async function seed(request: APIRequestContext, body: { title: string; notes?: string }) {
  const res = await request.post('/api/tasks', { data: body, headers: MATTHIAS });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: number; title: string };
}

const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Aufgabe bearbeiten' });
const openSheet = async (page: Page, title: string) => {
  await row(page, title).locator('.task-body').click();
  await expect(sheet(page)).toBeVisible();
};

const LONG = 'https://www.shop.example/de/akku/1s1pbl1865-2-6-battery.html?utm_source=chatgpt&ref=xyz#reviews';
const NOTES = `Akkutyp: 18650\n\nPassende Akkus:\n- vhbw 3000 mAh: ${LONG}\n- Kaufland (https://kaufland.example/product/497819613/).`;

test('TC-83 Liste: Notiz-Icon nur bei Aufgaben mit Notizen', async ({ page, request }) => {
  const withNotes = uniq('Notiz mit');
  const without = uniq('Notiz ohne');
  await seed(request, { title: withNotes, notes: 'etwas' });
  await seed(request, { title: without });
  await page.goto('/');
  await expect(row(page, withNotes).getByRole('img', { name: 'hat Notizen' })).toBeVisible();
  await expect(row(page, without)).toBeVisible();
  await expect(row(page, without).getByRole('img', { name: 'hat Notizen' })).toHaveCount(0);
});

test('TC-84 Sheet: Notizen lesbar, Links klickbar und ohne Query angezeigt', async ({ page, request }) => {
  const title = uniq('Notiz lesen');
  await seed(request, { title, notes: NOTES });
  await page.goto('/');
  await openSheet(page, title);
  const s = sheet(page);
  // no textarea until the pencil is tapped; the whole text is visible
  await expect(s.locator('textarea')).toHaveCount(0);
  await expect(s.getByText('Passende Akkus:')).toBeVisible();
  const shop = s.getByRole('link', { name: 'shop.example/de/akku/1s1pbl1865-2-6-battery.html', exact: true });
  await expect(shop).toHaveAttribute('href', LONG);
  await expect(shop).toHaveAttribute('target', '_blank');
  // trailing ")." stays text, trailing slash is dropped from the label
  const kaufland = s.getByRole('link', { name: 'kaufland.example/product/497819613', exact: true });
  await expect(kaufland).toHaveAttribute('href', 'https://kaufland.example/product/497819613/');
  // no horizontal scroll from the long URL
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('TC-85 Bearbeiten: Stift öffnet die Textarea, die mitwächst; Speichern behält den Text', async ({ page, request }) => {
  const title = uniq('Notiz bearbeiten');
  const task = await seed(request, { title, notes: NOTES });
  await page.goto('/');
  await openSheet(page, title);
  const s = sheet(page);
  await s.getByRole('button', { name: 'Notizen bearbeiten' }).click();
  const area = s.getByRole('textbox', { name: 'Notizen' });
  await expect(area).toBeFocused();
  await expect(area).toHaveValue(NOTES);
  const fits = () => area.evaluate((el: HTMLTextAreaElement) => [el.clientHeight, el.scrollHeight]);
  const [h1, sh1] = await fits();
  expect(h1).toBe(sh1); // whole text visible, no inner scroll
  await page.keyboard.type('\nnoch eine Zeile\nund noch eine');
  const [h2, sh2] = await fits();
  expect(h2).toBeGreaterThan(h1);
  expect(h2).toBe(sh2);
  await s.getByRole('button', { name: 'Speichern' }).click();
  await expect(s).toBeHidden();
  const { sections } = await (await request.get('/api/tasks', { headers: MATTHIAS })).json();
  const saved = Object.values(sections as Record<string, { id: number; notes: string }[]>)
    .flat()
    .find((x) => x.id === task.id);
  expect(saved?.notes).toBe(`${NOTES}\nnoch eine Zeile\nund noch eine`);
});

test('TC-86 Ohne Notizen: Textarea direkt da, zwei Zeilen hoch', async ({ page, request }) => {
  const title = uniq('Notiz leer');
  await seed(request, { title });
  await page.goto('/');
  await openSheet(page, title);
  const area = sheet(page).getByRole('textbox', { name: 'Notizen' });
  await expect(area).toBeVisible();
  const h = await area.evaluate((el) => el.clientHeight);
  expect(h).toBeGreaterThan(40);
  expect(h).toBeLessThan(100);
});
