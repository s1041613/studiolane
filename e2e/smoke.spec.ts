import { expect, test } from "@playwright/test";

test("home page responds with a 200 and renders the desktop", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL("/");
  await expect(page.getByText("studiolane", { exact: true })).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Dock" })).toBeVisible();
});
