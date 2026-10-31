import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// Read-only: runs against the dev server's real Supabase, so nothing here
// saves, archives or reactivates. The write paths are covered by
// settings-rules.write.spec.ts and the action/DB tests.
//
// Expects supabase/seed.sql's rows: a weekly room B block ("場地保養",
// 週六 10:00–12:00, kind: "rental"). The seed also has two weekly
// kind: "class_hours" rows and a one-day kind: "rental" opening 7 days out,
// but this page only ever shows kind: "rental" rows (class_hours belongs to
// a timetable page that doesn't exist yet), and the one-day opening is
// always a week ahead of "today" so it never falls in the default week.

test.beforeEach(async ({ page }) => {
  const response = await page.goto("/settings/rules");
  expect(response?.status()).toBe(200);
});

test("the 租借時段 tab and page render", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1, name: "設定" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "設定項目" }).getByRole("link", { name: "租借時段" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("button", { name: "新增", exact: true })).toBeVisible();
});

test("the list has one line per 租借規則, each with its own 編輯 and 停用", async ({ page }) => {
  // Room A has nothing active in the default week (its only kind: "rental"
  // row is the one-day opening, always a week ahead); room B's weekly block
  // shows every week, so switch to it before switching to the list.
  await page.getByRole("button", { name: "B", exact: true }).click();
  await page.getByRole("radio", { name: "清單" }).or(page.getByRole("button", { name: "清單" })).first().click();
  const list = page.getByRole("region", { name: "清單" });
  await expect(list.getByRole("button", { name: "編輯 週六 10:00–12:00 場地保養" })).toBeVisible();
  await expect(list.getByRole("button", { name: "停用 週六 10:00–12:00 場地保養" })).toBeVisible();
  // kind: "class_hours" rows belong to a timetable page that doesn't exist
  // yet, so this list never shows any.
  await expect(list.getByText("上課時段")).toHaveCount(0);
  // Any count: the write spec archives what it creates, so a reused
  // database may already have archived rows from an earlier run.
  const showArchived = page.getByText(/^顯示已停用（\d+）$/);
  await expect(showArchived).toBeVisible();
  await page.getByRole("radio", { name: "週視圖" }).or(page.getByRole("button", { name: "週視圖" })).first().click();
  await expect(showArchived).toBeHidden();
});

// The shared TimeCombobox: open the list, type the time, close it.
async function typeTime(page: Page, dialog: Locator, label: "開始" | "結束", value: string): Promise<void> {
  await dialog.getByRole("button", { name: label, exact: true }).click();
  await page.getByPlaceholder("輸入或選擇時間").fill(value);
  await page.keyboard.press("Escape");
  await expect(page.getByPlaceholder("輸入或選擇時間")).toHaveCount(0);
}

test("the add dialog checks times; 租借 only for one date", async ({ page }) => {
  await page.getByRole("button", { name: "新增", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新增租借規則" });
  await expect(dialog).toBeVisible();

  // A weekly rule has no 租借 field (always 不可租).
  await expect(dialog.getByRole("button", { name: "可租", exact: true })).toHaveCount(0);

  await typeTime(page, dialog, "開始", "13:35");
  await typeTime(page, dialog, "結束", "14:00");
  await dialog.getByLabel("原因").fill("測試");
  await dialog.getByRole("button", { name: "儲存", exact: true }).click();
  await expect(dialog).toContainText("請選至少一天");
  await expect(dialog).toContainText("時間要以 10 分鐘為單位");

  await typeTime(page, dialog, "開始", "14:30");
  await expect(dialog).toContainText("結束要晚於開始");

  await expect(dialog.getByLabel("日期")).toHaveCount(0);
  await dialog.getByRole("radio", { name: "指定日期" }).or(dialog.getByRole("button", { name: "指定日期" })).first().click();
  await expect(dialog.getByLabel("日期")).toBeVisible();
  // 租借 shows up for one date, 不可租 first.
  await expect(dialog.getByRole("button", { name: "可租", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "不可租", exact: true })).toHaveAttribute("aria-pressed", "true");

  // A changed form asks before closing.
  await dialog.getByRole("button", { name: "關閉" }).click();
  await expect(page.getByRole("alertdialog", { name: "放棄這次的修改？" })).toBeVisible();
  await page.getByRole("button", { name: "放棄" }).click();
  await expect(dialog).toBeHidden();
});
