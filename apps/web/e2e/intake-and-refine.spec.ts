import { expect, test } from './fixtures';

/** Intake, the refine view, locking, regeneration and deletion. */
test.describe('Intake', () => {
  test('creates a request from the modal and generates immediately', async ({ signedIn: page }) => {
    await page.getByRole('button', { name: 'New request' }).click();

    const dialog = page.getByRole('dialog', { name: 'Submit Request' });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('First name').fill('Elena');
    await dialog.getByLabel('Middle initial').fill('m');
    await dialog.getByLabel('Last name').fill('Fischer');
    // Clicking the visible segment is what an assistant does; the radio itself is
    // visually hidden beneath it.
    await dialog.getByText('Female', { exact: true }).click();
    await expect(dialog.getByRole('radio', { name: 'Female' })).toBeChecked();
    await dialog.getByLabel('Language / cultural origin').selectOption('German');
    await dialog.getByLabel('Notes').fill('Contemporary crime.');
    await dialog.getByRole('button', { name: 'Create & run' }).click();

    await expect(dialog).toBeHidden();

    const row = page.locator('tbody [role="row"]').filter({ hasText: 'Elena M. Fischer' });
    await expect(row).toHaveCount(1);
    await expect(row.getByText('Ready')).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText('No name overlap')).toBeVisible();
  });

  test('upper-cases the middle initial as it is typed', async ({ signedIn: page }) => {
    await page.getByRole('button', { name: 'New request' }).click();

    const middle = page.getByRole('dialog').getByLabel('Middle initial');
    await middle.fill('q');

    await expect(middle).toHaveValue('Q');
  });

  test('refuses to submit without a first and last name', async ({ signedIn: page }) => {
    const dialog = page.getByRole('dialog', { name: 'Submit Request' });

    await page.getByRole('button', { name: 'New request' }).click();
    await dialog.getByRole('button', { name: 'Create & run' }).click();

    await expect(dialog.getByRole('alert')).toContainText('first and last name');
    await expect(dialog).toBeVisible();
  });
});

test.describe('Refine view', () => {
  test.beforeEach(async ({ signedIn: page }) => {
    await page
      .locator('tbody [role="row"]')
      .filter({ hasText: 'Margaret E. Voss' })
      .getByRole('link', { name: /Edit the request/ })
      .click();

    await expect(page.getByRole('heading', { name: 'Margaret E. Voss' })).toBeVisible();
  });

  test('shows the brief, the exclusion list and the cleared candidates', async ({
    signedIn: page,
  }) => {
    await expect(page.getByLabel('Legal name')).toHaveValue('Margaret E. Voss');
    await expect(page.getByText('Excluded from results')).toBeVisible();
    await expect(page.getByText('Margaret', { exact: true })).toBeVisible();
    await expect(page.getByText('M.E.V.')).toBeVisible();
    await expect(page.getByText('4 discarded in screening')).toBeVisible();
    await expect(page.locator('nym-candidate-card')).toHaveCount(2);
  });

  test('selects a candidate, raising the approve bar, then approves it', async ({
    signedIn: page,
  }) => {
    await page.getByRole('button', { name: 'Select Nella P. QUINTRELL as the pen name' }).click();

    const bar = page.locator('.approve-bar');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('Nella P. QUINTRELL');

    await bar.getByRole('button', { name: 'Approve pen name' }).click();

    await expect(page.getByRole('status')).toContainText(
      'Nella P. QUINTRELL approved for Margaret E. Voss.',
    );
  });

  test('clears a selection again', async ({ signedIn: page }) => {
    await page.getByRole('button', { name: 'Select Nella P. QUINTRELL as the pen name' }).click();
    await page.locator('.approve-bar').getByRole('button', { name: 'Clear' }).click();

    await expect(page.locator('.approve-bar')).toBeHidden();
  });

  test('keeps a locked name through a regeneration and replaces the rest', async ({
    signedIn: page,
  }) => {
    await page
      .getByRole('button', { name: 'Lock Bridget C. ASHWORTH against regeneration' })
      .click();
    await expect(
      page.getByRole('button', { name: 'Unlock Bridget C. ASHWORTH against regeneration' }),
    ).toBeVisible();

    await page.getByLabel('Refine the candidate list').fill('shorter surnames');
    await page.getByRole('button', { name: /Regenerate/ }).click();

    await expect(page.getByText('Bridget C. ASHWORTH')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Nella P. QUINTRELL')).toHaveCount(0);
    await expect(page.locator('nym-candidate-card').first()).toContainText('Bridget C. ASHWORTH');
  });

  test('opens the prompt panel and shows the composed prompt', async ({ signedIn: page }) => {
    await page.getByRole('button', { name: /View prompt/ }).click();

    const dialog = page.getByRole('dialog', { name: 'Prompt' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Generation prompt')).toHaveValue(
      /Author legal name: Margaret E\. Voss/,
    );
    await expect(dialog.getByLabel('System instruction')).toHaveValue(
      /naming assistant for a publishing house/,
    );
  });

  test('deletes a request only after confirming', async ({ signedIn: page }) => {
    await page.getByRole('button', { name: 'Delete request' }).click();

    const dialog = page.getByRole('dialog', { name: 'Are you sure?' });
    await expect(dialog).toContainText('Margaret E. Voss');
    await expect(dialog).toContainText('cannot be undone');

    await dialog.getByRole('button', { name: 'Keep it' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Margaret E. Voss' })).toBeVisible();

    await page.getByRole('button', { name: 'Delete request' }).click();
    await page
      .getByRole('dialog', { name: 'Are you sure?' })
      .getByRole('button', { name: 'Delete request' })
      .click();

    await expect(page.getByRole('heading', { name: 'Pen name requests' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Margaret E. Voss deleted.');
    await expect(
      page.locator('tbody [role="row"]').filter({ hasText: 'Margaret E. Voss' }),
    ).toHaveCount(0);
  });
});
