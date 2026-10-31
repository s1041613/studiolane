import { expect, test } from "@playwright/test";

// The root loading.tsx streams every page, so notFound() arrives with a 200
// status (see Next's not-found docs); the check is "not a server error".

test("a batch id with no rows shows the not-found page", async ({ page }) => {
  const response = await page.goto("/bookings/batch/00000000-0000-0000-0000-000000000000");

  expect(response?.status()).toBeLessThan(500);
  await expect(page.getByText("找不到這批預約")).toBeVisible();
  await expect(page.getByRole("link", { name: "回到預約列表", exact: true })).toBeVisible();
});

test("a non-uuid batch id shows the not-found page, not a server error", async ({ page }) => {
  const response = await page.goto("/bookings/batch/not-a-uuid");

  expect(response?.status()).toBeLessThan(500);
  await expect(page.getByText("找不到這批預約")).toBeVisible();
});
