import { expect, test } from "@playwright/test";

// Minimal check that the Playwright + Next.js dev-server plumbing works.
test("home page responds with a 200 and renders a heading", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1")).toBeVisible();
});
