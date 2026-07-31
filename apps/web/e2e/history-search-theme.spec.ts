import { expect, test } from './fixtures';

test.describe('History', () => {
  test.beforeEach(async ({ signedIn: page }) => {
    await page.getByRole('link', { name: 'History' }).click();
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  });

  test('records the approved name, its checks and who signed it off', async ({
    signedIn: page,
  }) => {
    const row = page.locator('tbody [role="row"]').filter({ hasText: 'Priya R. Raman' });

    await expect(row.getByText('Ash T. FENNIMORE')).toBeVisible();
    await expect(row.getByText('No name overlap')).toBeVisible();
    await expect(row.getByText('No prior use')).toBeVisible();
    await expect(row.getByText('Rosa Marchetti')).toBeVisible();
    await expect(row.getByText('Approved')).toBeVisible();
  });

  test('reopens a request back into the queue', async ({ signedIn: page }) => {
    await page.getByRole('button', { name: 'Reopen the request for Priya R. Raman' }).click();

    await expect(page.getByText('No completed requests')).toBeVisible();

    await page.getByRole('link', { name: 'Queue' }).click();
    await expect(
      page.locator('tbody [role="row"]').filter({ hasText: 'Priya R. Raman' }),
    ).toHaveCount(1);
  });
});

test.describe('Search', () => {
  test('filters the queue as the assistant types', async ({ signedIn: page }) => {
    await page.getByLabel('Search requests and history').fill('daniel');

    await expect(page.locator('tbody [role="row"]')).toHaveCount(1);
    await expect(page.getByText('Daniel O.')).toBeVisible();
  });

  test('matches on a generated candidate, not just the author', async ({ signedIn: page }) => {
    await page.getByLabel('Search requests and history').fill('quintrell');

    await expect(page.locator('tbody [role="row"]')).toHaveCount(1);
    await expect(page.getByText('Margaret E. Voss')).toBeVisible();
  });

  test('points at the other tab when the hits are all over there', async ({ signedIn: page }) => {
    await page.getByLabel('Search requests and history').fill('priya');

    await expect(page.getByText('Queue clear')).toBeVisible();
    await expect(page.getByText('1 match in History')).toBeVisible();
  });

  test('clears the search and restores the full list', async ({ signedIn: page }) => {
    await page.getByLabel('Search requests and history').fill('daniel');
    await expect(page.locator('tbody [role="row"]')).toHaveCount(1);

    await page.getByRole('button', { name: 'Clear search' }).click();

    await expect(page.locator('tbody [role="row"]')).toHaveCount(2);
    await expect(page.getByLabel('Search requests and history')).toBeFocused();
  });
});

test.describe('Theme', () => {
  test('switches to dark and remembers the choice across a reload', async ({ signedIn: page }) => {
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
  });

  test('repaints the surfaces rather than only the text', async ({ signedIn: page }) => {
    const canvasBefore = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const canvasAfter = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(canvasAfter).not.toBe(canvasBefore);
  });
});

test.describe('Header menus', () => {
  test('the app picker lists the suite and marks Nym current', async ({ signedIn: page }) => {
    await page.getByRole('button', { name: 'Switch app' }).click();

    const menu = page.getByRole('menu', { name: 'Publishing suite' });
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Manuscripts')).toBeVisible();
    await expect(menu.getByText('Current')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('the account menu shows the signed-in assistant', async ({ signedIn: page }) => {
    await page.getByRole('button', { name: 'Account menu for Rosa Marchetti' }).click();

    const menu = page.getByRole('menu', { name: 'Account' });
    await expect(menu.getByText('Rosa Marchetti')).toBeVisible();
    await expect(menu.getByText('Publishing assistant · Trade')).toBeVisible();
    await expect(menu.getByText('Team & permissions')).toBeVisible();
  });
});
