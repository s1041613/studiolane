import { expect, test } from "@playwright/test";

// This suite runs against the real dev server, which reads/writes the real
// Supabase backend (no mocking layer exists in this project — see
// smoke.spec.ts). The write path (through the real form, into rentals) is
// covered separately by bookings.write.spec.ts, which only runs with
// E2E_WRITES=1; this file stays read-only so it always runs.
test("renders the booking form", async ({ page }) => {
  const response = await page.goto("/bookings/new");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "預約教室" })).toBeVisible();
  await expect(page.getByText("選擇租借人…")).toBeVisible();
});
