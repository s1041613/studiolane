import { expect, test } from "@playwright/test";

// E-46: read-only checks for the /bookings list — the page is reachable
// through nav, shows its own heading, and renders supabase/seed.sql's
// fictional rentals in the aria-labelled table. Nothing here writes to the
// DB, so it runs in the plain chromium project alongside the other
// read-only specs.

test("bookings page shows the 預約列表 heading and the seeded rows", async ({ page }) => {
  await page.goto("/bookings");

  await expect(page.getByRole("heading", { name: "預約列表", level: 1 })).toBeVisible();

  const table = page.getByRole("table", { name: "預約列表" });
  await expect(table).toBeVisible();
  // supabase/seed.sql's fictional rentals: a registered teacher booking and
  // a pending walk-in customer booking.
  await expect(table.getByText("林小雨")).toBeVisible();
  await expect(table.getByText("周小貓")).toBeVisible();
});

test("the nav's 預約列表 link goes from the home page to /bookings", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "預約列表", exact: true }).click();

  await expect(page).toHaveURL("/bookings");
  await expect(page.getByRole("heading", { name: "預約列表", level: 1 })).toBeVisible();
});

test("?q= shows only the matching renter", async ({ page }) => {
  await page.goto("/bookings?q=林小雨");

  const table = page.getByRole("table", { name: "預約列表" });
  await expect(table.getByText("林小雨")).toBeVisible();
  await expect(table.getByText("周小貓")).not.toBeVisible();
});

test("?q= trims surrounding whitespace", async ({ page }) => {
  await page.goto("/bookings?q=%20林小雨%20");

  const table = page.getByRole("table", { name: "預約列表" });
  await expect(table.getByText("林小雨")).toBeVisible();
  await expect(table.getByText("周小貓")).not.toBeVisible();
});

test("?q= with no match shows 找不到符合的預約", async ({ page }) => {
  await page.goto("/bookings?q=不存在的人");

  await expect(page.getByText("找不到符合的預約")).toBeVisible();
});

test("typing in the search box and submitting updates the URL", async ({ page }) => {
  await page.goto("/bookings");

  await page.getByRole("searchbox", { name: "搜尋" }).fill("林小雨");
  await page.getByRole("button", { name: "查詢" }).click();

  await expect(page).toHaveURL("/bookings?q=林小雨");
  const table = page.getByRole("table", { name: "預約列表" });
  await expect(table.getByText("林小雨")).toBeVisible();
  await expect(table.getByText("周小貓")).not.toBeVisible();
});

test("清除 goes back to /bookings showing every renter", async ({ page }) => {
  await page.goto("/bookings?q=林小雨");

  await page.getByRole("link", { name: "清除" }).click();

  await expect(page).toHaveURL("/bookings");
  const table = page.getByRole("table", { name: "預約列表" });
  await expect(table.getByText("林小雨")).toBeVisible();
  await expect(table.getByText("周小貓")).toBeVisible();
});
