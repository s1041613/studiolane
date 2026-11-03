import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// E-46/E-60: read-only checks for the /bookings list — the page is
// reachable through nav, defaults to 待確認 sorted by date and start time,
// and its filter bar (search, status, date range) applies only on 查詢.
// Nothing here writes to the DB, so it runs in the plain chromium project
// alongside the other read-only specs.

// Ticks one more box in the 狀態 multi-select, keeping whatever is already
// ticked (it opens on 待確認 alone).
async function addStatus(page: Page, label: string): Promise<void> {
  await page.locator('[aria-label="狀態"]').click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await page.keyboard.press("Escape");
}

test("bookings page defaults to 待確認 only, sorted by date then start time", async ({ page }) => {
  await page.goto("/bookings");

  await expect(page.getByRole("heading", { name: "預約列表", level: 1 })).toBeVisible();

  const table = page.getByRole("table", { name: "預約列表" });
  await expect(table).toBeVisible();
  // supabase/seed.sql's two pending walk-in bookings, same day, 周小貓 at
  // 10:00 then 吳小狗 at 10:30; 林小雨's registered booking stays hidden.
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("周小貓");
  await expect(rows.nth(1)).toContainText("吳小狗");
  await expect(table.getByText("林小雨")).not.toBeVisible();
});

test("the nav's 預約列表 link goes from the home page to /bookings", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "預約列表", exact: true }).click();

  await expect(page).toHaveURL("/bookings");
  await expect(page.getByRole("heading", { name: "預約列表", level: 1 })).toBeVisible();
});

test("searching for a name no booking has, then 查詢, shows 沒有符合條件的預約", async ({ page }) => {
  await page.goto("/bookings");

  await page.getByRole("searchbox", { name: "搜尋" }).fill("不存在的人");
  await page.getByRole("button", { name: "查詢" }).click();

  await expect(page.getByText("沒有符合條件的預約")).toBeVisible();
});

test("typing in the search box without pressing 查詢 leaves the list unchanged", async ({ page }) => {
  await page.goto("/bookings");

  const table = page.getByRole("table", { name: "預約列表" });
  await expect(table.getByText("周小貓")).toBeVisible();

  await page.getByRole("searchbox", { name: "搜尋" }).fill("不存在的人");

  await expect(table.getByText("周小貓")).toBeVisible();
  await expect(page.getByText("沒有符合條件的預約")).not.toBeVisible();
});

test("?day= opens on every status for that day, and the URL drops back to /bookings", async ({ page }) => {
  await page.goto("/bookings?day=2026-11-10");

  await expect(page).toHaveURL("/bookings");
  await expect(page.locator('[aria-label="狀態"]')).toContainText("全部狀態");
  await expect(page.locator('[aria-label="預約日期"]')).toContainText("11/10（二）");
});

// The row's action button is whatever allowedActions(rental) picks as
// primary (src/server/logic/bookings.ts) — read-only here, the write spec
// (booking-actions.write.spec.ts) is what actually clicks them.
test("周小貓's pending row shows a 確認 button", async ({ page }) => {
  await page.goto("/bookings");

  const row = page.locator("tr").filter({ hasText: "周小貓" });
  await expect(row).toHaveAttribute("data-status", "pending");
  await expect(row.getByRole("button", { name: "確認", exact: true })).toBeVisible();
});

test("adding 已登記 to the status filter surfaces 林小雨's row with a 標記完成 button, not 確認", async ({ page }) => {
  await page.goto("/bookings");

  await addStatus(page, "已登記");
  await page.getByRole("button", { name: "查詢" }).click();

  const row = page.locator("tr").filter({ hasText: "林小雨" });
  await expect(row).toHaveAttribute("data-status", "registered");
  await expect(row.getByRole("button", { name: "標記完成", exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "確認", exact: true })).toHaveCount(0);
});
