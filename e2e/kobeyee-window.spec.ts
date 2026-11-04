import { expect, test } from "@playwright/test";

// No AI wiring exists yet (see docs/desktop-ai-assistant), so this test
// only covers the window opening and closing, not any conversation
// behavior.

test("the cat opens Kobeyee, then closing the window returns the cat to the corner", async ({ page }) => {
  await page.goto("/bookings");

  const cat = page.getByRole("button", { name: "Kobeyee" });
  await expect(cat).toBeVisible();

  await cat.click();

  const kobeyee = page.getByRole("dialog", { name: "Kobeyee" });
  await expect(kobeyee).toBeVisible();
  await expect(kobeyee.getByPlaceholder("貼上 LINE 訊息")).toBeVisible();

  // The bookings window's own close button has the same accessible name,
  // so the click has to stay scoped to the Kobeyee dialog.
  await kobeyee.getByRole("button", { name: "關閉視窗" }).click();

  await expect(kobeyee).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Kobeyee" })).toBeVisible();
});
