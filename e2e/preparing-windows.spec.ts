import { expect, test } from "@playwright/test";

// The three still-unfinished routes — /settings/rules, /bookings/new,
// /bookings/batch/<id> — now show PreparingWindow's 準備中 instead of
// their real page (src/components/desktop/preparing-window.tsx). This
// replaces the specs that drove each page's real UI, now parked at
// src/app/_parked/ until each feature's own PR reconnects it. Restore from
// git history before this commit:
//   - e2e/settings-rules.spec.ts, e2e/settings-rules.write.spec.ts
//   - e2e/batch-detail.spec.ts
//   - e2e/booking-form.spec.ts
//   - e2e/bookings.write.spec.ts (drove /bookings/new as part of the
//     booking-write flow; its one /bookings-only test, "the bookings list
//     shows 已登記 and 待付款 as distinct statuses", can be lifted back out
//     unchanged once the form returns)
// Read-only: no DB writes, so this runs in the default chromium project.

const ROUTES: { path: string; title: string }[] = [
  { path: "/settings/rules", title: "設定" },
  { path: "/bookings/new", title: "預約教室" },
  { path: "/bookings/batch/00000000-0000-0000-0000-000000000000", title: "預約明細" },
];

for (const { path, title } of ROUTES) {
  test.describe(path, () => {
    test(`shows the desktop and a ${title} window saying 準備中`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(500);

      // The chrome around it: same assertions smoke.spec.ts makes for `/`.
      await expect(page.getByText("studiolane", { exact: true })).toBeVisible();
      await expect(page.getByRole("toolbar", { name: "Dock" })).toBeVisible();

      const dialog = page.getByRole("dialog", { name: title });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("準備中");
    });

    test("the red light returns to /", async ({ page }) => {
      await page.goto(path);
      const dialog = page.getByRole("dialog", { name: title });
      await expect(dialog).toBeVisible();

      await dialog.getByRole("button", { name: "關閉視窗" }).click();

      await expect(page).toHaveURL("/");
      await expect(dialog).toHaveCount(0);
    });
  });
}
