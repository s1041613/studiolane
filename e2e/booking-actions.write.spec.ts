import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { Client } from "pg";

// Row actions on /bookings: confirm, mark paid, mark done, postpone, cancel
// (E-55). Like bookings.write.spec.ts these mutate rentals directly, so they
// only run when E2E_WRITES=1 and the app talks to a local Supabase.

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

// Offsets picked past every date bookings.write.spec.ts uses (its furthest
// is +135), so neither file's seeded rentals can ever land on the same day
// and overlap by accident. 14:00 start times clear every seeded weekly rule
// (Monday 19:00-22:00 both rooms, room A Wednesday 19:00-21:00, room B
// Saturday 10:00-12:00) regardless of weekday, same reasoning as
// bookings.write.spec.ts's FREE_SLOT_DATE.
function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const CONFIRM_ONSITE_DATE = isoDaysFromNow(150);
const CONFIRM_RIVALS_DATE = isoDaysFromNow(157);
const PAID_THEN_DONE_DATE = isoDaysFromNow(164);
const CANCEL_PAID_DATE = isoDaysFromNow(171);
const POSTPONE_UNPAID_DATE = isoDaysFromNow(178);

// rentals.starts_at/ends_at are timestamptz; the app's wall-clock times are
// Asia/Taipei (src/server/supabase/codecs.ts toStartsEndsAt).
function taipeiInstant(date: string, time: string): string {
  return `${date}T${time}:00+08:00`;
}

type SeedRental = {
  room: "A" | "B";
  renterName: string;
  date: string;
  start: string;
  end: string;
  status: string;
  paymentState: "unpaid" | "paid" | "not_required";
  paymentMethod: "on_site" | "transfer" | null;
  amount: number | null;
};

async function seedRental(db: Client, rental: SeedRental): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into rentals (room, renter_type, renter_id, renter_name, purpose, starts_at, ends_at, status, payment_state, payment_method, amount)
     values ($1, 'customer', null, $2, 'dance', $3, $4, $5, $6, $7, $8)
     returning id`,
    [
      rental.room,
      rental.renterName,
      taipeiInstant(rental.date, rental.start),
      taipeiInstant(rental.date, rental.end),
      rental.status,
      rental.paymentState,
      rental.paymentMethod,
      rental.amount,
    ],
  );
  return rows[0].id;
}

async function deleteRentals(db: Client, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.query("delete from rentals where id = any($1)", [ids]);
}

function rowFor(page: import("@playwright/test").Page, id: string): Locator {
  return page.locator(`[data-rent="${id}"]`);
}

// The dev server streams HTML before React hydrates it; a click that lands
// first does nothing, so retry until the expected UI shows up. Same helper
// as bookings.write.spec.ts, duplicated so this file stays self-contained.
async function clickUntil(button: Locator, shown: Locator): Promise<void> {
  await expect(async () => {
    await button.click();
    await expect(shown).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

test("confirming an onsite pending booking registers it and swaps the row's button", async ({ page }) => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const renterName = `E2E現場確認${STAMP}`;
  const id = await seedRental(db, {
    room: "A",
    renterName,
    date: CONFIRM_ONSITE_DATE,
    start: "14:00",
    end: "15:00",
    status: "pending",
    paymentState: "unpaid",
    paymentMethod: "on_site",
    amount: 600,
  });

  try {
    await page.goto("/bookings");
    const row = rowFor(page, id);
    await expect(row).toHaveAttribute("data-status", "pending");
    await expect(row.getByRole("button", { name: "確認", exact: true })).toBeVisible();

    await clickUntil(
      row.getByRole("button", { name: "確認", exact: true }),
      row.getByRole("button", { name: "標記已付款", exact: true }),
    );

    await expect(row).toHaveAttribute("data-status", "registered");
    await expect(row.getByRole("button", { name: "確認", exact: true })).toHaveCount(0);
  } finally {
    await deleteRentals(db, [id]);
    await db.end();
  }
});

test("confirming a pending booking that overlaps another pending rival is refused and changes neither row", async ({
  page,
}) => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const renterName = `E2E撞待確認${STAMP}`;
  const rivalName = `E2E撞對手${STAMP}`;
  const id = await seedRental(db, {
    room: "B",
    renterName,
    date: CONFIRM_RIVALS_DATE,
    start: "14:00",
    end: "15:00",
    status: "pending",
    paymentState: "unpaid",
    paymentMethod: "on_site",
    amount: 400,
  });
  const rivalId = await seedRental(db, {
    room: "B",
    renterName: rivalName,
    date: CONFIRM_RIVALS_DATE,
    start: "14:00",
    end: "15:00",
    status: "pending",
    paymentState: "unpaid",
    paymentMethod: "on_site",
    amount: 400,
  });

  try {
    await page.goto("/bookings");
    const row = rowFor(page, id);
    const rivalRow = rowFor(page, rivalId);

    const notice = page.getByRole("alertdialog", { name: "不能確認" });
    await clickUntil(row.getByRole("button", { name: "確認", exact: true }), notice);
    await expect(notice).toContainText("跟 1 筆預約時間重疊，請先取消或延期下面這幾筆，再回來確認");
    await expect(notice).toContainText(rivalName);

    await notice.getByRole("button", { name: "確定", exact: true }).click();
    await expect(notice).toBeHidden();

    await expect(row).toHaveAttribute("data-status", "pending");
    await expect(rivalRow).toHaveAttribute("data-status", "pending");
  } finally {
    await deleteRentals(db, [id, rivalId]);
    await db.end();
  }
});

test("marking a transfer booking paid then done removes the row's buttons", async ({ page }) => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const renterName = `E2E付款完成${STAMP}`;
  const id = await seedRental(db, {
    room: "A",
    renterName,
    date: PAID_THEN_DONE_DATE,
    start: "14:00",
    end: "15:00",
    status: "awaiting_payment",
    paymentState: "unpaid",
    paymentMethod: "transfer",
    amount: 600,
  });

  try {
    await page.goto("/bookings");
    const row = rowFor(page, id);
    await expect(row).toHaveAttribute("data-status", "awaiting_payment");

    await clickUntil(
      row.getByRole("button", { name: "標記已付款", exact: true }),
      row.getByRole("button", { name: "標記完成", exact: true }),
    );
    await expect(row).toHaveAttribute("data-status", "registered");

    // markDone leaves the row with no actions at all (completed is
    // terminal), so there's no replacement button to wait for — only the
    // 標記完成 button itself going away, which clickUntil can't express.
    const markDone = row.getByRole("button", { name: "標記完成", exact: true });
    await expect(async () => {
      await markDone.click();
      await expect(markDone).toBeHidden({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });

    await expect(row).toHaveAttribute("data-status", "completed");
    await expect(row.getByRole("button")).toHaveCount(0);
  } finally {
    await deleteRentals(db, [id]);
    await db.end();
  }
});

test("cancelling a paid booking warns about the refund before it goes through", async ({ page }) => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const renterName = `E2E取消已付${STAMP}`;
  const id = await seedRental(db, {
    room: "A",
    renterName,
    date: CANCEL_PAID_DATE,
    start: "14:00",
    end: "15:00",
    status: "registered",
    paymentState: "paid",
    paymentMethod: "transfer",
    amount: 600,
  });

  try {
    await page.goto("/bookings");
    const row = rowFor(page, id);

    const menu = page.locator('[data-slot="popover-content"]');
    await clickUntil(row.getByRole("button", { name: "更多操作", exact: true }), menu);
    await menu.getByRole("button", { name: "取消", exact: true }).click();

    const dialog = page.getByRole("alertdialog", { name: "取消這筆預約？" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("這筆已付款");
    await expect(dialog).toContainText("取消後需要退款");

    await dialog.getByRole("button", { name: "確定取消", exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(row).toHaveAttribute("data-status", "cancelled");
    const { rows } = await db.query<{ note: string }>("select note from rentals where id = $1", [id]);
    expect(rows[0].note).toContain("【需要退款】");
  } finally {
    await deleteRentals(db, [id]);
    await db.end();
  }
});

test("postponing an unpaid booking shows no refund warning", async ({ page }) => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const renterName = `E2E延期未付${STAMP}`;
  const id = await seedRental(db, {
    room: "B",
    renterName,
    date: POSTPONE_UNPAID_DATE,
    start: "14:00",
    end: "15:00",
    status: "pending",
    paymentState: "unpaid",
    paymentMethod: "on_site",
    amount: 400,
  });

  try {
    await page.goto("/bookings");
    const row = rowFor(page, id);

    const menu = page.locator('[data-slot="popover-content"]');
    await clickUntil(row.getByRole("button", { name: "更多操作", exact: true }), menu);
    await menu.getByRole("button", { name: "延期", exact: true }).click();

    const dialog = page.getByRole("alertdialog", { name: "延期這筆預約？" });
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toContainText("退款");

    await dialog.getByRole("button", { name: "確定延期", exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect(row).toHaveAttribute("data-status", "postponed");
  } finally {
    await deleteRentals(db, [id]);
    await db.end();
  }
});
