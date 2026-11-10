import { expect, test } from "@playwright/test";

// E-46: read-only checks for the /bookings list — the page is reachable
// through nav, shows its own heading, and renders supabase/seed.sql's
// fictional rentals in the 預約冊 shelf (sidebar folders + a grid of rows).
// Nothing here writes to the DB, so it runs in the plain chromium project
// alongside the other read-only specs.

function grid(page: import("@playwright/test").Page) {
  return page.getByRole("grid", { name: "預約" });
}

test("bookings page shows the 預約列表 heading and the seeded rows", async ({ page }) => {
  await page.goto("/bookings");

  await expect(page.getByRole("heading", { name: "預約列表", level: 1 })).toBeVisible();

  // supabase/seed.sql's fictional rentals: a registered teacher booking and
  // a pending walk-in customer booking.
  await expect(grid(page).getByText("林小雨")).toBeVisible();
  await expect(grid(page).getByText("周小貓")).toBeVisible();
});

test("the nav's 預約列表 link goes from the home page to /bookings", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "預約列表", exact: true }).click();

  await expect(page).toHaveURL("/bookings");
  await expect(page.getByRole("heading", { name: "預約列表", level: 1 })).toBeVisible();
});

test("?q= shows only the matching renter", async ({ page }) => {
  await page.goto("/bookings?q=林小雨");

  await expect(grid(page).getByText("林小雨")).toBeVisible();
  await expect(grid(page).getByText("周小貓")).not.toBeVisible();
});

test("?q= trims surrounding whitespace", async ({ page }) => {
  await page.goto("/bookings?q=%20林小雨%20");

  await expect(grid(page).getByText("林小雨")).toBeVisible();
  await expect(grid(page).getByText("周小貓")).not.toBeVisible();
});

test("?q= with no match shows 找不到符合的預約", async ({ page }) => {
  await page.goto("/bookings?q=不存在的人");

  await expect(page.getByText("找不到符合的預約")).toBeVisible();
});

test("typing in the toolbar search box and pressing Enter updates the URL", async ({ page }) => {
  await page.goto("/bookings");

  await page.getByRole("searchbox", { name: "搜尋" }).fill("林小雨");
  await page.getByRole("searchbox", { name: "搜尋" }).press("Enter");

  await expect(page).toHaveURL("/bookings?q=林小雨");
  await expect(grid(page).getByText("林小雨")).toBeVisible();
  await expect(grid(page).getByText("周小貓")).not.toBeVisible();
});

// The row's 狀態 cell is a menu trigger, not a standalone action button —
// read-only here, the write spec (booking-actions.write.spec.ts) is what
// actually opens the menu and clicks an item.
test("周小貓's pending row's 狀態 cell reads 待確認", async ({ page }) => {
  await page.goto("/bookings");

  const row = page.locator("tr").filter({ hasText: "周小貓" });
  await expect(row).toHaveAttribute("data-status", "pending");
  await expect(row.getByRole("button", { name: "狀態 待確認", exact: true })).toBeVisible();
});

test("林小雨's paid registered row's 狀態 cell reads 已登記", async ({ page }) => {
  await page.goto("/bookings");

  const row = page.locator("tr").filter({ hasText: "林小雨" });
  await expect(row).toHaveAttribute("data-status", "registered");
  await expect(row.getByRole("button", { name: "狀態 已登記", exact: true })).toBeVisible();
});

test("清除 goes back to /bookings showing every renter", async ({ page }) => {
  await page.goto("/bookings?q=林小雨");

  await page.getByRole("link", { name: "清除" }).click();

  await expect(page).toHaveURL("/bookings");
  await expect(grid(page).getByText("林小雨")).toBeVisible();
  await expect(grid(page).getByText("周小貓")).toBeVisible();
});

test("the 教室 sidebar folder 小教室 shows only room B's rows", async ({ page }) => {
  await page.goto("/bookings");

  await page.getByRole("navigation", { name: "預約冊資料夾" }).getByRole("button", { name: "小教室" }).click();

  await expect(grid(page).getByText("陳大樹")).toBeVisible();
  await expect(grid(page).getByText("林小雨")).not.toBeVisible();
});

test("each row shows its 備註 after 金額", async ({ page }) => {
  await page.goto("/bookings");

  const row = page.locator("tr").filter({ hasText: "周小貓" });
  await expect(row.locator("td").last()).toContainText("想借瑜珈墊");
});

test("rows start oldest date first, and the 日期 header flips the order", async ({ page }) => {
  await page.goto("/bookings");

  const dates = () => grid(page).locator("tbody tr td:first-child").allInnerTexts();
  await expect(grid(page).getByText("林小雨")).toBeVisible();
  const ascending = await dates();
  await expect(page.getByRole("columnheader", { name: /日期/ })).toHaveAttribute("aria-sort", "ascending");

  await page.getByRole("columnheader", { name: /日期/ }).getByRole("button").click();
  await expect(page.getByRole("columnheader", { name: /日期/ })).toHaveAttribute("aria-sort", "descending");
  expect(await dates()).toEqual([...ascending].reverse());
});

test("the title stays 預約冊 across folders, and 上一頁 goes back to 全部", async ({ page }) => {
  await page.goto("/bookings");
  const window = page.getByRole("dialog", { name: "預約冊" });

  await page.getByRole("navigation", { name: "預約冊資料夾" }).getByRole("button", { name: "小教室" }).click();
  await expect(window.getByText("預約冊", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "上一頁" }).click();
  await expect(grid(page).getByText("林小雨")).toBeVisible();
  await expect(window.getByText(/^\d+ 筆預約/)).toBeVisible();
});
