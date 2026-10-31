import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { Client } from "pg";

// Booking write flows: a free slot booked through the real form, and an
// overlapping slot that the server reports as a conflict with someone
// else's held booking. Like the other *.write specs these touch data, so
// they only run when E2E_WRITES=1 and the app talks to a local Supabase.
//
// This project has no @supabase/supabase-js dependency — studiolane talks
// to Postgres through drizzle + pg — so seeding the rival booking and
// reading/cleaning up what the form wrote goes through `pg` directly, the
// same client src/server/db/*.db.test.ts already use against DATABASE_URL.

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function writesAllowed(): boolean {
  if (process.env.E2E_WRITES !== "1" || !process.env.DATABASE_URL) return false;
  try {
    return LOCAL_HOSTS.has(new URL(SUPABASE_URL).hostname);
  } catch {
    return false;
  }
}

test.skip(!writesAllowed(), "write flows need E2E_WRITES=1, a local SUPABASE_URL and DATABASE_URL");

const STAMP = Date.now().toString(36).slice(-5);

// supabase/seed.sql's weekly rental_rules all sit outside 14:00–15:00
// (Monday 19:00–22:00 both rooms, room A Wednesday 19:00–21:00, room B
// Saturday 10:00–12:00), so that slot is free on room B (the form's
// default) whatever day it falls on. Picking the day 100+ days out
// clears every seeded rental too (the latest is current_date + 3) and the
// seed's one-day 可租 opening (current_date + 7), without needing a fixed
// calendar date that could go stale.
function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const FREE_SLOT_DATE = isoDaysFromNow(100);
const CONFLICT_DATE = isoDaysFromNow(107);
const TAKEN_DATE = isoDaysFromNow(114);
const LIST_DATE = isoDaysFromNow(121);
const MULTI_DATES = [isoDaysFromNow(128), isoDaysFromNow(129), isoDaysFromNow(130)];
const SLOT_START = "14:00";
const SLOT_END = "15:00";

// rentals.starts_at/ends_at are timestamptz; the app's wall-clock times are
// Asia/Taipei (src/server/supabase/codecs.ts toStartsEndsAt).
function taipeiInstant(date: string, time: string): string {
  return `${date}T${time}:00+08:00`;
}

// The dev server streams HTML before React hydrates it; a click that lands
// first does nothing, so retry until the expected UI shows up. Same helper
// as settings-rules.write.spec.ts, duplicated so this file stays
// self-contained.
async function clickUntil(button: Locator, shown: Locator): Promise<void> {
  await expect(async () => {
    await button.click();
    await expect(shown).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

// E-47: a successful submit navigates to /bookings/batch/<batchId> instead
// of showing a notice.
const BATCH_URL_PATTERN = /\/bookings\/batch\/[0-9a-f-]{36}$/;

// The batch table's rows, excluding the trailing 合計 (totals) row that
// always closes it.
function batchDataRows(page: Page): Locator {
  return page.locator("table tbody tr").filter({ hasNotText: "合計" });
}

// PersonPicker (src/components/shared/people/person-picker.tsx) with
// create: "open" offers a typed name that isn't on the roster as a new 外部
// 客戶 — this is that offer row, worded by the booking form's own label.
async function pickNewCustomer(page: Page, name: string): Promise<void> {
  await clickUntil(page.getByRole("button", { name: "選擇租借人…", exact: true }), page.getByPlaceholder("搜尋姓名…"));
  await page.getByPlaceholder("搜尋姓名…").fill(name);
  await page.getByRole("option", { name: `新增「${name}」為外部客戶` }).click();
}

// MultiDatePicker's Calendar (react-day-picker) has no year/month dropdown
// here (captionLayout defaults to "label"), so reaching a far-future month
// means clicking "Go to the Next Month" — react-day-picker's own label for
// that button, unlocalized in this app — the exact number of times. Each
// day cell carries the real date it's showing as data-day (yyyy-MM-dd, from
// react-day-picker's CalendarDay), which is unique within the displayed
// month and sidesteps the day button's own aria-label (a full English date
// sentence, "Tuesday, March 4th, 2031"-shaped, not worth matching exactly).
async function pickDate(page: Page, iso: string): Promise<void> {
  const [year, month] = iso.split("-").map(Number);
  const now = new Date();
  const monthsAhead = (year - now.getFullYear()) * 12 + (month - 1 - now.getMonth());
  const nextMonth = page.getByRole("button", { name: "Go to the Next Month", exact: true });

  await page.getByRole("button", { name: "選擇日期", exact: true }).click();
  await expect(nextMonth).toBeVisible();
  for (let i = 0; i < monthsAhead; i++) {
    await nextMonth.click();
  }
  await page.locator(`[data-day="${iso}"]`).getByRole("button").click();
  await page.keyboard.press("Escape");
}

// Same calendar as pickDate, but mode="multiple" keeps the popover open
// across selections, so every date is clicked without reopening it. isos
// must be given in ascending order so the displayed month only ever
// advances forward.
async function pickDates(page: Page, isos: string[]): Promise<void> {
  const now = new Date();
  const nextMonth = page.getByRole("button", { name: "Go to the Next Month", exact: true });

  await page.getByRole("button", { name: "選擇日期", exact: true }).click();
  await expect(nextMonth).toBeVisible();

  let monthsShown = 0;
  for (const iso of isos) {
    const [year, month] = iso.split("-").map(Number);
    const monthsAhead = (year - now.getFullYear()) * 12 + (month - 1 - now.getMonth());
    for (; monthsShown < monthsAhead; monthsShown++) {
      await nextMonth.click();
    }
    await page.locator(`[data-day="${iso}"]`).getByRole("button").click();
  }
  await page.keyboard.press("Escape");
}

// TimeCombobox (src/components/shared/schedule/time-combobox.tsx): click the
// button named "開始"/"結束", type the time, Escape. Same pattern as
// settings-rules.write.spec.ts's typeTime — base-ui's Popover opens fine on
// a Playwright click in this project's @base-ui/react 1.9.
async function fillTime(page: Page, label: "開始" | "結束", value: string): Promise<void> {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByPlaceholder("輸入或選擇時間").fill(value);
  await page.keyboard.press("Escape");
  await expect(page.getByPlaceholder("輸入或選擇時間")).toHaveCount(0);
}

// Same as fillTime, scoped to one date's slot card: booking-sheet.tsx wraps
// each SlotCard in data-field="slot-{index}", since more than one date
// means more than one 開始/結束 button on the page at once.
async function fillSlotTime(page: Page, index: number, label: "開始" | "結束", value: string): Promise<void> {
  await page.locator(`[data-field="slot-${index}"]`).getByRole("button", { name: label, exact: true }).click();
  await page.getByPlaceholder("輸入或選擇時間").fill(value);
  await page.keyboard.press("Escape");
  await expect(page.getByPlaceholder("輸入或選擇時間")).toHaveCount(0);
}

// Renter, date and the 14:00–15:00 slot, through the real form. Room stays
// at its default (B); purpose and payment keep their defaults (dance,
// transfer), both open to a 外部客戶.
async function fillBookingForm(page: Page, renterName: string, date: string): Promise<void> {
  await page.goto("/bookings/new");
  await pickNewCustomer(page, renterName);
  await pickDate(page, date);
  await fillTime(page, "開始", SLOT_START);
  await fillTime(page, "結束", SLOT_END);
}

async function countRentalsNamed(db: Client, renterName: string): Promise<number> {
  const { rowCount } = await db.query("select id from rentals where renter_name = $1", [renterName]);
  return rowCount ?? 0;
}

async function deleteRentalsNamed(db: Client, renterName: string): Promise<void> {
  await db.query("delete from rentals where renter_name = $1", [renterName]);
}

test("a free slot books through the form and the row lands in rentals", async ({ page }) => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const renterName = `E2E空檔${STAMP}`;

  try {
    await fillBookingForm(page, renterName, FREE_SLOT_DATE);
    await page.getByRole("button", { name: "送出預約", exact: true }).click();

    await expect(page).toHaveURL(BATCH_URL_PATTERN);
    await expect(batchDataRows(page)).toHaveCount(1);

    const { rows } = await db.query<{ id: string; room: string; starts_at: string; ends_at: string; status: string }>(
      "select id, room, starts_at, ends_at, status from rentals where renter_name = $1",
      [renterName],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].room).toBe("B");
    expect(rows[0].status).toBe("pending");
    expect(new Date(rows[0].starts_at).toISOString()).toBe(new Date(taipeiInstant(FREE_SLOT_DATE, SLOT_START)).toISOString());
    expect(new Date(rows[0].ends_at).toISOString()).toBe(new Date(taipeiInstant(FREE_SLOT_DATE, SLOT_END)).toISOString());

    // E-46: the same rental shows up read-only on /bookings, still pending
    // and with no rival overlapping it.
    await page.goto("/bookings");
    const bookedRow = page.locator(`[data-rent="${rows[0].id}"]`);
    await expect(bookedRow).toBeVisible();
    await expect(bookedRow).toContainText("待確認");
    await expect(bookedRow).not.toContainText("撞單");
  } finally {
    await deleteRentalsNamed(db, renterName);
    await db.end();
  }
});

// E-49: a successful submit must never flash a red outline (aria-invalid).
test("a three-date booking lands on the batch page with one row per date", async ({ page }) => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const renterName = `E2E三天${STAMP}`;

  try {
    await page.goto("/bookings/new");
    await pickNewCustomer(page, renterName);
    await pickDates(page, MULTI_DATES);
    for (let index = 0; index < MULTI_DATES.length; index++) {
      await fillSlotTime(page, index, "開始", SLOT_START);
      await fillSlotTime(page, index, "結束", SLOT_END);
    }

    await page.getByRole("button", { name: "送出預約", exact: true }).click();
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
    await expect(page).toHaveURL(BATCH_URL_PATTERN);
    await expect(batchDataRows(page)).toHaveCount(MULTI_DATES.length);

    expect(await countRentalsNamed(db, renterName)).toBe(MULTI_DATES.length);
  } finally {
    await deleteRentalsNamed(db, renterName);
    await db.end();
  }
});

// Someone else's held booking overlapping the submitted slot
// (ConflictConfirmDialog, src/components/booking/conflict-confirm-dialog.tsx).
// 取消 leaves the form as is and writes nothing; resubmitting shows the same
// conflict again, and 仍要送出 resends with it acknowledged.
test("an overlapping slot is blocked until 仍要送出, and 取消 writes nothing", async ({ page }) => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const rivalName = `E2E對手${STAMP}`;
  const renterName = `E2E衝突${STAMP}`;

  const { rows: rivalRows } = await db.query<{ id: string }>(
    `insert into rentals (room, renter_type, renter_id, renter_name, purpose, starts_at, ends_at, status, payment_state, payment_method, amount)
     values ('B', 'customer', null, $1, 'dance', $2, $3, 'pending', 'unpaid', 'transfer', 400)
     returning id`,
    [rivalName, taipeiInstant(CONFLICT_DATE, SLOT_START), taipeiInstant(CONFLICT_DATE, SLOT_END)],
  );
  const rivalId: string = rivalRows[0].id;

  try {
    await fillBookingForm(page, renterName, CONFLICT_DATE);
    await page.getByRole("button", { name: "送出預約", exact: true }).click();

    const conflictDialog = page.getByRole("alertdialog", { name: "這個時段已有其他預約" });
    await expect(conflictDialog).toBeVisible();
    await expect(conflictDialog).toContainText(rivalName);
    await expect(conflictDialog).toContainText("待確認"); // statusToLabel("pending")

    await conflictDialog.getByRole("button", { name: "取消", exact: true }).click();
    await expect(conflictDialog).toBeHidden();
    expect(await countRentalsNamed(db, renterName)).toBe(0);

    await page.getByRole("button", { name: "送出預約", exact: true }).click();
    await expect(conflictDialog).toBeVisible();
    await conflictDialog.getByRole("button", { name: "仍要送出", exact: true }).click();
    await expect(conflictDialog).toBeHidden();

    await expect(page).toHaveURL(BATCH_URL_PATTERN);
    await expect(batchDataRows(page)).toHaveCount(1);

    expect(await countRentalsNamed(db, renterName)).toBe(1);

    // E-46: /bookings flags both sides of the acknowledged overlap as 撞單,
    // but leaves an unrelated booking (the seeded 吳小狗, a different room
    // at a different time) alone.
    await page.goto("/bookings");
    const rivalRow = page.locator("tr").filter({ hasText: rivalName });
    const renterRow = page.locator("tr").filter({ hasText: renterName });
    const noConflictRow = page.locator("tr").filter({ hasText: "吳小狗" });
    await expect(rivalRow).toContainText("撞單");
    await expect(renterRow).toContainText("撞單");
    await expect(noConflictRow).not.toContainText("撞單");
  } finally {
    await db.query("delete from rentals where id = $1", [rivalId]);
    await deleteRentalsNamed(db, renterName);
    await db.end();
  }
});

// A different renter's REGISTERED booking overlapping the submitted slot is
// a hard block: the field error from booking-rules' wording, never the
// confirm dialog, and nothing written.
test("a registered rival's slot is rejected as a field error, not the confirm dialog", async ({ page }) => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const rivalName = `E2E已登記${STAMP}`;
  const renterName = `E2E撞已登記${STAMP}`;

  const { rows: rivalRows } = await db.query<{ id: string }>(
    `insert into rentals (room, renter_type, renter_id, renter_name, purpose, starts_at, ends_at, status, payment_state, payment_method, amount)
     values ('B', 'customer', null, $1, 'dance', $2, $3, 'registered', 'unpaid', 'transfer', 400)
     returning id`,
    [rivalName, taipeiInstant(TAKEN_DATE, SLOT_START), taipeiInstant(TAKEN_DATE, SLOT_END)],
  );
  const rivalId: string = rivalRows[0].id;

  try {
    await fillBookingForm(page, renterName, TAKEN_DATE);
    await page.getByRole("button", { name: "送出預約", exact: true }).click();

    await expect(page.getByRole("alertdialog", { name: "這個時段已有其他預約" })).toBeHidden();
    await expect(page.getByText(`${SLOT_START}–${SLOT_END} 已有人預約`)).toBeVisible();

    expect(await countRentalsNamed(db, renterName)).toBe(0);
  } finally {
    await db.query("delete from rentals where id = $1", [rivalId]);
    await deleteRentalsNamed(db, renterName);
    await db.end();
  }
});

// E-46: seeds one registered and one awaiting-payment rental directly; the
// form only ever writes pending ones.
test("the bookings list shows 已登記 and 待付款 as distinct statuses", async ({ page }) => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const registeredName = `E2E列表已登記${STAMP}`;
  const awaitingName = `E2E列表待付款${STAMP}`;

  const { rows: registeredRows } = await db.query<{ id: string }>(
    `insert into rentals (room, renter_type, renter_id, renter_name, purpose, starts_at, ends_at, status, payment_state, payment_method, amount)
     values ('A', 'customer', null, $1, 'dance', $2, $3, 'registered', 'paid', 'transfer', 400)
     returning id`,
    [registeredName, taipeiInstant(LIST_DATE, "14:00"), taipeiInstant(LIST_DATE, "15:00")],
  );
  const { rows: awaitingRows } = await db.query<{ id: string }>(
    `insert into rentals (room, renter_type, renter_id, renter_name, purpose, starts_at, ends_at, status, payment_state, payment_method, amount)
     values ('B', 'customer', null, $1, 'dance', $2, $3, 'awaiting_payment', 'unpaid', 'transfer', 400)
     returning id`,
    [awaitingName, taipeiInstant(LIST_DATE, "16:00"), taipeiInstant(LIST_DATE, "17:00")],
  );
  const registeredId = registeredRows[0].id;
  const awaitingId = awaitingRows[0].id;

  try {
    // LIST_DATE is further out than every other write-spec date, so both
    // rows sort to the top of page 1.
    await page.goto("/bookings");
    const registeredRow = page.locator("tr").filter({ hasText: registeredName });
    const awaitingRow = page.locator("tr").filter({ hasText: awaitingName });

    await expect(registeredRow).toContainText("已登記");
    await expect(awaitingRow).toContainText("待付款");
  } finally {
    await db.query("delete from rentals where id = any($1)", [[registeredId, awaitingId]]);
    await db.end();
  }
});
