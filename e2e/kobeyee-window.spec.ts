import { expect, test, type Page } from "@playwright/test";

// The reader is a fixture (no AI yet): any message reads as five legal
// slots in 小教室 with no renter.

async function openKobeyee(page: Page) {
  await page.goto("/bookings");
  await page.getByRole("button", { name: "Kobeyee" }).click();
  const kobeyee = page.getByRole("dialog", { name: "Kobeyee" });
  await expect(kobeyee).toBeVisible();
  return kobeyee;
}

test("the cat opens Kobeyee, then closing the window returns the cat to the corner", async ({ page }) => {
  const kobeyee = await openKobeyee(page);
  await expect(kobeyee.getByPlaceholder("貼上 LINE 訊息")).toBeVisible();

  // The bookings window's own close button has the same accessible name,
  // so the click has to stay scoped to the Kobeyee dialog.
  await kobeyee.getByRole("button", { name: "關閉視窗" }).click();

  await expect(kobeyee).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Kobeyee" })).toBeVisible();
});

test("sending a message expands into a filled 預約教室 form; 清除 collapses it", async ({ page }) => {
  const kobeyee = await openKobeyee(page);
  // Measure only after the open animation's scale-in has settled.
  await expect.poll(() => kobeyee.evaluate((el) => getComputedStyle(el).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  const chatBox = await kobeyee.boundingBox();

  await kobeyee.getByPlaceholder("貼上 LINE 訊息").fill("想借小教室");
  await kobeyee.getByRole("button", { name: "送出" }).click();

  const booking = page.getByRole("dialog", { name: "預約教室" });
  await expect(booking).toBeVisible();
  await expect(booking.getByText("5 段可以")).toBeVisible();
  await expect(booking.locator("[data-slot-row]")).toHaveCount(5);
  await expect(booking.getByText("選擇租借人")).toBeVisible();
  await expect(booking.getByTestId("booking-total")).toHaveCount(0);

  // Grows leftward: the right edge stays where the chat-only window was.
  await expect
    .poll(async () => {
      const box = await booking.boundingBox();
      return box && chatBox ? Math.round(box.x + box.width - (chatBox.x + chatBox.width)) : null;
    })
    .toBe(0);

  await booking.getByText("選擇租借人").click();
  await page.getByRole("option", { name: "林小雨" }).click();
  await expect(booking.getByTestId("booking-total")).toBeVisible();

  await booking.getByRole("button", { name: "清除" }).click();
  await expect(page.getByRole("dialog", { name: "Kobeyee" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Kobeyee" }).getByText("貼上 LINE 訊息", { exact: true })).toBeVisible();
});

test("the Dock 預約教室 icon opens the form expanded and empty", async ({ page }) => {
  await page.goto("/bookings");
  await page.getByRole("button", { name: "預約教室" }).click();

  const booking = page.getByRole("dialog", { name: "預約教室" });
  await expect(booking).toBeVisible();
  await expect(booking.getByText("選擇租借人")).toBeVisible();
  await expect(booking.locator("[data-slot-row]")).toHaveCount(0);
});
