import { expect, test } from "@playwright/test";

// Step 3 of the desktop refactor: the 預約冊 window's open state follows
// the URL, two-way, instead of a store flag that could drift from the
// route. Read-only (no DB writes), so it runs in the default chromium
// project alongside the other read-only specs.

test("the Dock's 預約冊 icon opens and closes the window through the URL", async ({ page }) => {
  await page.goto("/");

  const dialog = page.getByRole("dialog", { name: "預約冊" });
  await expect(dialog).toHaveCount(0);

  await page.getByRole("toolbar", { name: "Dock" }).getByRole("button", { name: "預約冊" }).click();
  await expect(page).toHaveURL("/bookings");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "關閉視窗" }).click();
  await expect(page).toHaveURL("/");
  await expect(dialog).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL("/bookings");
  await expect(dialog).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL("/bookings");
  await expect(dialog).toBeVisible();
});
