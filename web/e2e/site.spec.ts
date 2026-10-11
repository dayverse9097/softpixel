import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockBackend } from './mock';

const PUBLIC_PATHS = ['/', '/discover', '/game/neon-pong', '/play/neon-pong', '/favorites', '/about', '/privacy', '/terms', '/contact', '/admin/login'];

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

test('game text is shown as text and nothing runs', async ({ page }) => {
  await page.goto('/discover');
  await expect(page.getByText('<img src=x onerror=window.__xss=1>')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  await expect(page.locator("main img[src='x'], main script")).toHaveCount(0);
});

test('the player runs a game in a locked-down frame', async ({ page }) => {
  await page.goto('/play/neon-pong');
  const frame = page.locator('iframe');
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-pointer-lock');
  await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
  await expect(page.frameLocator('iframe').locator('canvas')).toHaveCount(1);
});

test('a missing build and an untrusted address fail safely', async ({ page }) => {
  await page.goto('/play/missing');
  await expect(page.getByText('This game didn’t load.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);

  await page.goto('/play/evil');
  await expect(page.getByText('does not trust')).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('the skip link is the first keyboard stop and focus follows navigation', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard navigation is checked on desktop');
  await page.goto('/');
  await expect(page.locator('article').first()).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.getByRole('link', { name: 'Discover' }).first().click();
  await expect(page.getByRole('heading', { name: 'Discover games' })).toBeFocused();
});

test('the mobile menu opens and Escape closes it', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the menu button only exists on small screens');
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu' });
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.click();
  await expect(page.locator('#mobile-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused();
});

test('admin pages ask anonymous visitors to sign in', async ({ page }) => {
  await page.goto('/admin/games/new');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
});

for (const path of PUBLIC_PATHS) {
  test(`no horizontal scrolling on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test(`no accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(500); // let the page transition settle so colours are final
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length} element(s)`)).toEqual([]);
  });
}
