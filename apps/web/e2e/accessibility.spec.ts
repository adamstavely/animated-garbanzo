import { expect, expectNoAccessibilityViolations, test } from './fixtures';

/**
 * WCAG 2.2 AA verification.
 *
 * axe covers what a static scan can prove — contrast, names, roles, structure —
 * and the keyboard journeys below cover what it cannot: focus order, focus traps,
 * and focus restoration.
 */
test.describe('Accessibility', () => {
  test('the queue has no violations in either theme', async ({ signedIn: page }) => {
    await expectNoAccessibilityViolations(page);

    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await expectNoAccessibilityViolations(page);
  });

  test('history has no violations', async ({ signedIn: page }) => {
    await page.getByRole('link', { name: 'History' }).click();
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    await expectNoAccessibilityViolations(page);
  });

  test('the refine view has no violations', async ({ signedIn: page }) => {
    await page
      .locator('tbody [role="row"]')
      .filter({ hasText: 'Margaret E. Voss' })
      .getByRole('link', { name: /Edit the request/ })
      .click();
    await expect(page.getByRole('heading', { name: 'Margaret E. Voss' })).toBeVisible();

    await expectNoAccessibilityViolations(page);
  });

  test('the intake dialog has no violations', async ({ signedIn: page }) => {
    await page.getByRole('button', { name: 'New request' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await expectNoAccessibilityViolations(page);
  });

  test('the page declares its language and has one h1', async ({ signedIn: page }) => {
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });

  test('a skip link is the first thing a keyboard user reaches', async ({ signedIn: page }) => {
    await page.keyboard.press('Tab');

    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
  });

  test('every icon-only control has an accessible name', async ({ signedIn: page }) => {
    for (const name of ['Switch to dark theme', 'Switch app', 'Account menu for Rosa Marchetti']) {
      await expect(page.getByRole('button', { name })).toBeVisible();
    }

    await page.getByLabel('Search requests and history').fill('voss');
    await expect(page.getByRole('button', { name: 'Clear search' })).toBeVisible();
  });

  test('every interactive control clears the 24px minimum target size', async ({
    signedIn: page,
  }) => {
    const undersized = await page.evaluate(() => {
      const selector = 'button, a[href], input, select, textarea, [role="button"]';
      return Array.from(document.querySelectorAll<HTMLElement>(selector))
        .filter((element) => {
          const box = element.getBoundingClientRect();
          const visible = box.width > 0 && box.height > 0;
          return visible && (box.width < 24 || box.height < 24);
        })
        .map((element) => `${element.tagName.toLowerCase()}: ${element.textContent?.trim() ?? ''}`);
    });

    expect(undersized).toEqual([]);
  });

  test('the modal traps focus, closes on Escape and restores focus to its trigger', async ({
    signedIn: page,
  }) => {
    const trigger = page.getByRole('button', { name: 'New request' });
    await trigger.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Tab all the way round; focus must never leave the dialog.
    for (let step = 0; step < 20; step++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => {
        const panel = document.querySelector('.modal__panel');
        return panel ? panel.contains(document.activeElement) : false;
      });
      expect(inside).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('the approval toast is announced politely without stealing focus', async ({
    signedIn: page,
  }) => {
    const approve = page.getByRole('button', {
      name: 'Approve Bridget C. ASHWORTH for Margaret E. Voss',
    });
    await approve.focus();
    await page.keyboard.press('Enter');

    const toast = page.getByRole('status');
    await expect(toast).toContainText('approved');
    await expect(toast).toHaveAttribute('aria-live', 'polite');

    // Focus stays in the page, not on the announcement.
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
    expect(focusedTag).not.toBe('div');
  });

  test('a whole request can be approved with the keyboard alone', async ({ signedIn: page }) => {
    await page
      .getByRole('button', { name: 'Approve Bridget C. ASHWORTH for Margaret E. Voss' })
      .focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('status')).toContainText('approved for Margaret E. Voss');
  });

  test('the table exposes its columns to assistive technology', async ({ signedIn: page }) => {
    await expect(page.locator('[role="table"]')).toBeVisible();
    await expect(page.locator('[role="columnheader"]')).toHaveCount(6);
    await expect(page.locator('caption')).toHaveCount(1);
  });

  test('content reflows at 400% zoom without a horizontal scrollbar', async ({
    signedIn: page,
  }) => {
    // 1280x1024 at 400% is the 320x256 CSS viewport that 1.4.10 specifies.
    await page.setViewportSize({ width: 320, height: 256 });

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );

    expect(overflows).toBe(false);
    await expectNoAccessibilityViolations(page);
  });
});
