import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// Write flows for /settings/rules: unlike settings-rules.spec.ts these SAVE
// data, so they only run when E2E_WRITES=1 and the app talks to a local
// Supabase (the throwaway stack the no-mistakes/CI pipeline resets before a
// write run). They run in their own project, after the read-only spec
// (playwright.config.ts), which asserts on seed data. Names carry a run
// stamp so reruns on the same database don't collide; every row this file
// creates it also archives before finishing.

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function writesAllowed(): boolean {
  if (process.env.E2E_WRITES !== "1") return false;
  try {
    return LOCAL_HOSTS.has(new URL(SUPABASE_URL).hostname);
  } catch {
    return false;
  }
}

test.skip(!writesAllowed(), "write flows need E2E_WRITES=1 and a local SUPABASE_URL");
test.describe.configure({ mode: "serial" });

const STAMP = Date.now().toString(36).slice(-5);

// WEEKDAY_ZH_ISO (server/logic/date.ts), duplicated here so this spec stays
// self-contained: index 1 (Monday) .. 7 (Sunday), matching rental_rules.weekday.
const WEEKDAY_CHARS = ["", "一", "二", "三", "四", "五", "六", "日"];

// The dev server streams HTML before React hydrates it; a click that lands
// first does nothing, so retry until the expected UI shows up.
async function clickUntil(button: Locator, shown: Locator): Promise<void> {
  await expect(async () => {
    await button.click();
    await expect(shown).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

// The shared TimeCombobox: open the list, type the time, close it.
async function typeTime(page: Page, dialog: Locator, label: "開始" | "結束", value: string): Promise<void> {
  await dialog.getByRole("button", { name: label, exact: true }).click();
  await page.getByPlaceholder("輸入或選擇時間").fill(value);
  await page.keyboard.press("Escape");
  await expect(page.getByPlaceholder("輸入或選擇時間")).toHaveCount(0);
}

async function confirm(page: Page, title: string, label: string): Promise<void> {
  const alertDialog = page.getByRole("alertdialog", { name: title });
  await alertDialog.getByRole("button", { name: label, exact: true }).click();
  await expect(alertDialog).toBeHidden();
}

async function discard(page: Page, dialog: Locator): Promise<void> {
  await dialog.getByRole("button", { name: "關閉" }).click();
  await expect(page.getByRole("alertdialog", { name: "放棄這次的修改？" })).toBeVisible();
  await page.getByRole("button", { name: "放棄" }).click();
  await expect(dialog).toBeHidden();
}

async function openRulesPage(page: Page): Promise<void> {
  await page.goto("/settings/rules");
  await expect(page.getByRole("button", { name: "新增", exact: true })).toBeVisible();
}

async function openListView(page: Page): Promise<Locator> {
  const list = page.getByRole("region", { name: "清單" });
  await clickUntil(page.getByRole("radio", { name: "清單" }).or(page.getByRole("button", { name: "清單" })).first(), list);
  return list;
}

async function openCreateDialog(page: Page): Promise<Locator> {
  const dialog = page.getByRole("dialog", { name: "新增租借規則" });
  await clickUntil(page.getByRole("button", { name: "新增", exact: true }), dialog);
  return dialog;
}

async function setRooms(dialog: Locator, rooms: readonly ("A" | "B")[]): Promise<void> {
  const group = dialog.getByRole("group", { name: "教室" });
  for (const room of ["A", "B"] as const) {
    const toggle = group.getByRole("button", { name: room, exact: true });
    const pressed = (await toggle.getAttribute("aria-pressed")) === "true";
    if (pressed !== rooms.includes(room)) await toggle.click();
  }
}

async function setWeekdays(dialog: Locator, weekdays: readonly number[]): Promise<void> {
  const group = dialog.getByRole("group", { name: "星期" });
  for (const weekday of weekdays) {
    await group.getByRole("button", { name: WEEKDAY_CHARS[weekday], exact: true }).click();
  }
}

test("create, edit and archive a 租借規則, persisting through a reload at each step", async ({ page }) => {
  const reason = `整合測試${STAMP}`;
  const editedReason = `整合測試${STAMP}（已編輯）`;

  await openRulesPage(page);
  const createDialog = await openCreateDialog(page);
  // 週二 05:00–06:00, room A: clear of every seeded weekly/one-day rule and
  // of every seeded booking's time (supabase/seed.sql's earliest start is 10:00).
  await setWeekdays(createDialog, [2]);
  await typeTime(page, createDialog, "開始", "05:00");
  await typeTime(page, createDialog, "結束", "06:00");
  await createDialog.getByLabel("原因").fill(reason);
  await createDialog.getByRole("button", { name: "儲存", exact: true }).click();
  await expect(createDialog).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "已新增 1 筆租借規則" })).toBeVisible();

  // Reload: the new row persisted.
  await openRulesPage(page);
  let list = await openListView(page);
  await expect(list.getByRole("button", { name: `編輯 週二 05:00–06:00 ${reason}` })).toBeVisible();

  // Edit: change the reason, save, and the row's own buttons update.
  const editButton = list.getByRole("button", { name: `編輯 週二 05:00–06:00 ${reason}` });
  const editDialog = page.getByRole("dialog", { name: `編輯：週二 ${reason}` });
  await clickUntil(editButton, editDialog);
  await editDialog.getByLabel("原因").fill(editedReason);
  await editDialog.getByRole("button", { name: "儲存", exact: true }).click();
  await expect(editDialog).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "已儲存" })).toBeVisible();

  // Reload: the edit persisted.
  await openRulesPage(page);
  list = await openListView(page);
  const editedButton = list.getByRole("button", { name: `編輯 週二 05:00–06:00 ${editedReason}` });
  await expect(editedButton).toBeVisible();

  // Archive: confirm, and the row leaves the default (active-only) list.
  const archiveButton = list.getByRole("button", { name: `停用 週二 05:00–06:00 ${editedReason}` });
  await clickUntil(archiveButton, page.getByRole("alertdialog"));
  await confirm(page, "停用這個租借規則？", "停用");
  await expect(page.getByRole("status").filter({ hasText: "已停用" })).toBeVisible();
  await expect(editedButton).toHaveCount(0);

  // Reload: the archive persisted — hidden by default, shown (with 已停用
  // and an 啟用 button instead) once 顯示已停用 is on.
  await openRulesPage(page);
  list = await openListView(page);
  await expect(list.getByRole("button", { name: `編輯 週二 05:00–06:00 ${editedReason}` })).toHaveCount(0);
  await clickUntil(page.getByText(/^顯示已停用（\d+）$/), list.getByRole("button", { name: `啟用 週二 05:00–06:00 ${editedReason}` }));
  const archivedRow = list.getByRole("row").filter({ hasText: editedReason });
  await expect(archivedRow).toContainText("已停用");
});

test("submitting an invalid time range shows a field error instead of failing", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await openRulesPage(page);
  const dialog = await openCreateDialog(page);
  await setWeekdays(dialog, [4]);
  await typeTime(page, dialog, "開始", "14:30");
  await typeTime(page, dialog, "結束", "14:00");
  await dialog.getByLabel("原因").fill(`整合測試${STAMP}-範圍`);
  await dialog.getByRole("button", { name: "儲存", exact: true }).click();

  // Caught client-side (server/logic/scheduling-range.ts's timeRangeError):
  // a field error, not a 500 or an unhandled exception, and nothing saved.
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("結束要晚於開始");
  expect(pageErrors).toEqual([]);

  await discard(page, dialog);
});

test("editing a rule's time to cover an existing booking is blocked and lists it", async ({ page }) => {
  const reason = `整合測試${STAMP}-衝突`;

  // supabase/seed.sql's rentals are dated off Postgres's current_date, which
  // runs in UTC, while the app's "today" (and this test's) is Asia/Taipei;
  // the two dates agree except for the few hours after UTC midnight, so the
  // seeded booking 2 days out lands on one of these two candidate weekdays.
  const taipeiToday = new Date(
    `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())}T00:00:00Z`,
  );
  const isoWeekdayOf = (date: Date): number => {
    const day = date.getUTCDay();
    return day === 0 ? 7 : day;
  };
  const addDays = (date: Date, days: number): Date => {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  };
  const candidates = [1, 2].map((offset) => isoWeekdayOf(addDays(taipeiToday, offset)));

  await openRulesPage(page);
  const createDialog = await openCreateDialog(page);
  // Room B, 08:00–09:00: clear of both seeded room B bookings (10:30–11:30
  // and 14:00–15:00) and of the seed's own room B weekly block (10:00–12:00).
  await setRooms(createDialog, ["B"]);
  await setWeekdays(createDialog, candidates);
  await typeTime(page, createDialog, "開始", "08:00");
  await typeTime(page, createDialog, "結束", "09:00");
  await createDialog.getByLabel("原因").fill(reason);
  await createDialog.getByRole("button", { name: "儲存", exact: true }).click();
  await expect(createDialog).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: `已新增 ${candidates.length} 筆租借規則` })).toBeVisible();

  await openRulesPage(page);
  await page.getByRole("button", { name: "B", exact: true }).click();
  const list = await openListView(page);

  // Try each candidate weekday's row: stretching its time to 13:00–16:00
  // covers 陳大樹's 14:00–15:00 booking (supabase/seed.sql) on whichever one
  // is really 2 days out, and only that one.
  let matched = false;
  for (const weekday of candidates) {
    const editButton = list.getByRole("button", { name: `編輯 週${WEEKDAY_CHARS[weekday]} 08:00–09:00 ${reason}` });
    const editDialog = page.getByRole("dialog", { name: `編輯：週${WEEKDAY_CHARS[weekday]} ${reason}` });
    await clickUntil(editButton, editDialog);
    await typeTime(page, editDialog, "開始", "13:00");
    await typeTime(page, editDialog, "結束", "16:00");

    // docs/rental-time-rules "Impact on existing bookings": the dialog
    // previews overlaps a few hundred ms after a field changes.
    const overlap = editDialog.getByRole("status").filter({ hasText: "陳大樹" });
    const found = await overlap
      .waitFor({ state: "visible", timeout: 1_500 })
      .then(() => true)
      .catch(() => false);

    if (found) {
      matched = true;
      await expect(editDialog).toContainText("這段時間有 1 筆預約，不能存");
      await expect(editDialog.getByRole("button", { name: "儲存", exact: true })).toBeDisabled();
    }

    // Either way: this test only reads the preview, it never saves the edit.
    await discard(page, editDialog);
    if (found) break;
  }
  expect(matched, "neither candidate weekday matched the seeded booking 2 days out").toBe(true);

  // Reload: the blocked edit never saved — both rows are still at their
  // original, non-conflicting time.
  await openRulesPage(page);
  await page.getByRole("button", { name: "B", exact: true }).click();
  const reloadedList = await openListView(page);
  for (const weekday of candidates) {
    await expect(reloadedList.getByRole("button", { name: `編輯 週${WEEKDAY_CHARS[weekday]} 08:00–09:00 ${reason}` })).toBeVisible();
  }

  // Clean up: archive both rows (neither blocks anything at 08:00–09:00).
  for (const weekday of candidates) {
    const archiveButton = reloadedList.getByRole("button", { name: `停用 週${WEEKDAY_CHARS[weekday]} 08:00–09:00 ${reason}` });
    await clickUntil(archiveButton, page.getByRole("alertdialog"));
    await confirm(page, "停用這個租借規則？", "停用");
  }
});
