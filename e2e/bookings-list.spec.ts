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
