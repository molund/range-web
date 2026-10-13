const { test, expect } = require('@playwright/test');

test('root page loads', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.ok()).toBeTruthy();
});
