import { test, expect } from '@playwright/test';

test('TC-05 Seite lädt am Handy-Viewport und begrüßt den Benutzer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Haushalt', level: 1 })).toBeVisible();
  await expect(page.getByText('Hallo, Matthias (e2e)')).toBeVisible();
  await expect(page.getByText('Noch keine Aufgaben.')).toBeVisible();
  // No horizontal scroll at 390px.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
