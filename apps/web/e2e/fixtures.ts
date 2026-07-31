import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test as base } from '@playwright/test';

/**
 * Shared setup: every spec starts from a freshly seeded database with a signed-in
 * assistant. `/api/v1/test/session` is served only by the end-to-end API process.
 */
export const test = base.extend<{ signedIn: Page }>({
  signedIn: async ({ page }, use) => {
    await page.goto('/api/v1/test/session');
    await expect(page.getByRole('heading', { name: 'Pen name requests' })).toBeVisible();
    await use(page);
  },
});

export { expect };

/**
 * Runs axe against the current page and asserts there are no WCAG 2.2 A/AA
 * violations. `disableRules` is only for rules a specific view legitimately
 * cannot satisfy, and each use should say why.
 */
export async function expectNoAccessibilityViolations(
  page: Page,
  options: { disableRules?: string[] } = {},
): Promise<void> {
  const builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
  ]);

  if (options.disableRules?.length) {
    builder.disableRules(options.disableRules);
  }

  const results = await builder.analyze();

  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.target.join(' ')),
    })),
  ).toEqual([]);
}
