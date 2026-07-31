import { expect, test } from './fixtures';

/** The queue is the assistant's default view: confirm the checks, approve. */
test.describe('Queue', () => {
  test('lists open requests with their screening checks', async ({ signedIn: page }) => {
    const rows = page.locator('tbody [role="row"]');

    await expect(rows).toHaveCount(2);
    await expect(page.getByText('Margaret E. Voss')).toBeVisible();
    await expect(page.getByText('Bridget C. ASHWORTH')).toBeVisible();

    const readyRow = rows.filter({ hasText: 'Margaret E. Voss' });
    await expect(readyRow.getByText('No name overlap')).toBeVisible();
    await expect(readyRow.getByText('No prior use')).toBeVisible();
    await expect(readyRow.getByText('Not a famous name')).toBeVisible();
    await expect(readyRow.getByText('No offensive terms')).toBeVisible();
    await expect(readyRow.getByText('Ready')).toBeVisible();
  });

  test('keeps approved requests out of the queue', async ({ signedIn: page }) => {
    await expect(
      page.locator('tbody [role="row"]').filter({ hasText: 'Priya R. Raman' }),
    ).toHaveCount(0);
  });

  test('offers Retry only on a failed request', async ({ signedIn: page }) => {
    const failedRow = page.locator('tbody [role="row"]').filter({ hasText: 'Daniel O.' });
    const readyRow = page.locator('tbody [role="row"]').filter({ hasText: 'Margaret E. Voss' });

    await expect(failedRow.getByRole('button', { name: /Retry/ })).toBeVisible();
    await expect(failedRow.getByText('Generation failed')).toBeVisible();
    await expect(readyRow.getByRole('button', { name: /Retry/ })).toHaveCount(0);
  });

  test('approves a row, confirms with a toast and moves it to History', async ({
    signedIn: page,
  }) => {
    await page
      .getByRole('button', { name: 'Approve Bridget C. ASHWORTH for Margaret E. Voss' })
      .click();

    await expect(page.getByRole('status')).toContainText(
      'Bridget C. ASHWORTH approved for Margaret E. Voss.',
    );
    await expect(page.locator('tbody [role="row"]')).toHaveCount(1);

    await page.getByRole('link', { name: 'History' }).click();

    const historyRow = page.locator('tbody [role="row"]').filter({ hasText: 'Margaret E. Voss' });
    await expect(historyRow.getByText('Bridget C. ASHWORTH')).toBeVisible();
    await expect(historyRow.getByText('Rosa Marchetti')).toBeVisible();
  });

  test('approves every ready request at once', async ({ signedIn: page }) => {
    await page.getByRole('button', { name: /Approve all ready/ }).click();

    await expect(page.getByRole('status')).toContainText('approved and moved to History');
    // The failed request has nothing to approve, so it is the only one left.
    await expect(page.locator('tbody [role="row"]')).toHaveCount(1);
    await expect(page.getByText('Daniel O.')).toBeVisible();
  });

  test('retries a failed generation and lands on cleared candidates', async ({
    signedIn: page,
  }) => {
    const failedRow = page.locator('tbody [role="row"]').filter({ hasText: 'Daniel O.' });
    await failedRow.getByRole('button', { name: /Retry/ }).click();

    await expect(failedRow.getByText('Ready')).toBeVisible({ timeout: 20_000 });
    await expect(failedRow.getByText('No name overlap')).toBeVisible();
  });

  test('shows the empty state once nothing is left to review', async ({ signedIn: page }) => {
    await page.getByRole('button', { name: /Approve all ready/ }).click();

    const failedRow = page.locator('tbody [role="row"]').filter({ hasText: 'Daniel O.' });
    await failedRow.getByRole('button', { name: /Retry/ }).click();
    await expect(failedRow.getByText('Ready')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /Approve all ready/ }).click();

    await expect(page.getByText('Queue clear')).toBeVisible();
  });
});
