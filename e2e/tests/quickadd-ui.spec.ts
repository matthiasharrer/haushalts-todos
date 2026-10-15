// Quick-add chips, TC-101…102, at the configured phone viewport (390×844).
// Every locator is scoped to the task a test created (the e2e DB is shared).
import { test, expect, type Page } from '@playwright/test';
import { MATTHIAS, addDays, today, uniq } from '../support/tasks.js';

const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title });
const section = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const chips = (page: Page) => page.getByRole('group', { name: 'Fälligkeit und Wichtigkeit' });
const chip = (page: Page, name: string) => chips(page).getByRole('button', { name, exact: true });
const field = (page: Page) => page.getByRole('textbox', { name: 'Neue Aufgabe' });

test('TC-101 Chips: nur mit Fokus, Auswahl bleibt bei Text erhalten, Anlegen setzt zurück', async ({ page }) => {
  const title = uniq('Chips Fenster');
  await page.goto('/');
  await expect(chips(page)).toHaveCount(0);

  await field(page).click();
  await expect(chip(page, 'Heute')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, 'Wichtig')).toHaveAttribute('aria-pressed', 'false');
  await field(page).fill(title);
  await chip(page, 'Wichtig').click();
  await chip(page, 'Morgen').click();
  await expect(field(page)).toBeFocused();
  await expect(chip(page, 'Morgen')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, 'Heute')).toHaveAttribute('aria-pressed', 'false');

  // leave the field: row closes, the field remembers what differs from the default
  await page.locator('.app-bar h1').click();
  await expect(chips(page)).toHaveCount(0);
  await expect(page.getByTestId('add-hint')).toContainText('morgen');
  await field(page).click();
  await expect(chip(page, 'Wichtig')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, 'Morgen')).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Hinzufügen' }).click();
  await expect(section(page, 'Demnächst').getByText(title)).toBeVisible();
  await expect(row(page, title)).toContainText('wichtig');
  await expect(row(page, title)).toContainText('morgen');
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveValue('');
  await expect(chip(page, 'Heute')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, 'Wichtig')).toHaveAttribute('aria-pressed', 'false');

  // the pressed "Heute" removes the date -> Irgendwann
  const someday = uniq('Chips irgendwann');
  await field(page).fill(someday);
  await chip(page, 'Heute').click();
  await expect(chip(page, 'Heute')).toHaveAttribute('aria-pressed', 'false');
  await field(page).press('Enter');
  await expect(section(page, 'Irgendwann').getByText(someday)).toBeVisible();

  // no text left when leaving -> the choice resets
  await chip(page, 'Morgen').click();
  await page.locator('.app-bar h1').click();
  await expect(page.getByTestId('add-hint')).toHaveCount(0);
  await field(page).click();
  await expect(chip(page, 'Heute')).toHaveAttribute('aria-pressed', 'true');

  const noHScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(noHScroll).toBe(true);
});

test('TC-102 Scrollposition bleibt nach dem Schließen der Tastatur erhalten', async ({ page, request }) => {
  const tag = uniq('Scroll');
  for (let i = 0; i < 14; i++) {
    const res = await request.post('/api/tasks', {
      data: { title: `${tag} ${i}`, dueDate: addDays(today(), 2) },
      headers: MATTHIAS,
    });
    expect(res.status()).toBe(201);
  }
  await page.goto('/');
  await expect(row(page, `${tag} 13`)).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 400));
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(300);

  await field(page).click();
  // what the phone browser does when the keyboard opens for a fixed bar
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.app-bar h1').click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before);
});
