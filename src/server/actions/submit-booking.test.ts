import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unseal } from "@/lib/result";
import { PaymentMethod, PaymentState, RentalStatus } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";
import type { BookingDraft } from "@/server/logic/booking";
import type { CreateBookingBatchResult, NewRentalRow } from "@/server/repositories/rental-repository";
import { SAMPLE_PLANS, SAMPLE_PURPOSE_SETTINGS, SAMPLE_RULES, STAFF, TEACHER, makeRental } from "@/server/logic/test-fixtures";
import type { PurposeSetting } from "@/server/logic/purpose-rules";

const data = vi.hoisted(() => ({
  rentals: [] as RentalSummary[],
  purposeSettings: [] as PurposeSetting[],
  createBatch: vi.fn<(rows: NewRentalRow[], acknowledgedIds: readonly string[]) => Promise<CreateBookingBatchResult>>(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Signed in as uki; the DAL itself is covered by auth/require-staff.test.ts.
vi.mock("@/server/auth/require-staff", () => ({
  requireStaff: async () => ({ id: "r-07", name: "uki", authMethod: "password" }),
}));
vi.mock("@/server/repositories/rental-repository", () => ({
  RentalRepository: class {
    listAll = async () => data.rentals;
    createBatch = data.createBatch;
  },
}));
vi.mock("@/server/repositories/rules-repository", () => ({
  RulesRepository: class {
    listAll = async () => SAMPLE_RULES;
  },
}));
vi.mock("@/server/repositories/roster-repository", () => ({
  RosterRepository: class {
    listAll = async () => [TEACHER, STAFF];
  },
}));
vi.mock("@/server/repositories/pricing-repository", () => ({
  PricingRepository: class {
    listAll = async () => SAMPLE_PLANS;
  },
}));
vi.mock("@/server/repositories/purpose-settings-repository", () => ({
  PurposeSettingsRepository: class {
    listAll = async () => data.purposeSettings;
  },
}));

const { submitBooking } = await import("@/server/actions/submit-booking");

// Tuesday 2026-10-06, room B.
const draft: BookingDraft = {
  room: "B",
  renter: { type: "roster", id: TEACHER.id, name: TEACHER.name, role: "teacher" },
  slots: [
    { date: "2026-10-06", start: "15:00", end: "17:00", isCrossMidnight: false },
    { date: "2026-10-07", start: "15:00", end: "16:00", isCrossMidnight: false },
  ],
  purpose: "dance",
  payment: "transfer",
  note: "",
};

const ERROR_ID = expect.stringMatching(/^[0-9a-f]{8}$/);

beforeEach(() => {
  vi.clearAllMocks();
  data.rentals = [];
  data.purposeSettings = SAMPLE_PURPOSE_SETTINGS;
  data.createBatch.mockResolvedValue({ status: "created" });
  // The drafts book 10/6–10/7; pin "now" before them so they aren't rejected as already past.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T00:00:00+08:00"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("submitBooking", () => {
  it("S-寫入-1: 寫入每個時段一列，共用 server 產生的 batch_id", async () => {
    const result = unseal(await submitBooking(draft));
    expect(result).toMatchObject({ ok: true });
    const rows = data.createBatch.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      renterId: TEACHER.id,
      renterType: "roster",
      purpose: "dance",
      paymentMethod: PaymentMethod.Transfer,
      paymentState: PaymentState.Unpaid,
      amount: 500,
    });
    expect(rows[0].batchId).toMatch(/^[0-9a-f-]{36}$/);
    expect(rows[1].batchId).toBe(rows[0].batchId);
  });

  it("T21 / L18: 經手人自動填登入的人", async () => {
    await submitBooking(draft);
    expect(data.createBatch.mock.calls[0][0].map((row) => row.handler)).toEqual(["uki", "uki"]);
  });

  it("情境1 / 無衝突預設送到資料庫，acknowledgedIds 預設是空的", async () => {
    await submitBooking(draft);
    expect(data.createBatch.mock.calls[0][1]).toEqual([]);
  });

  it("S-完成-1: 成功時回傳這次送出的編號，讓畫面跳到明細", async () => {
    const result = unseal(await submitBooking(draft));
    const rows = data.createBatch.mock.calls[0][0];
    expect(result).toEqual({ ok: true, data: { batchId: rows[0].batchId, rentalIds: rows.map((r) => r.id) } });
  });

  it("S-寫入-2: 櫃檯的櫃檯使用（櫃檯價 0／0）→ 付款方式空＋無需付款＋0 元", async () => {
    await submitBooking({
      ...draft,
      renter: { type: "roster", id: STAFF.id, name: STAFF.name, role: "staff" },
      purpose: "front_desk",
    });
    expect(data.createBatch.mock.calls[0][0][0]).toMatchObject({
      paymentMethod: null,
      paymentState: PaymentState.NotRequired,
      amount: 0,
    });
  });

  it("別人已登記的時段重疊 → 不在表單擋，交給 create_booking_batch 判斷衝突", async () => {
    data.rentals = [
      makeRental({ room: "B", date: "2026-10-06", start: "14:30", end: "15:30", status: RentalStatus.Registered }),
    ];
    await submitBooking(draft);
    expect(data.createBatch).toHaveBeenCalledTimes(1);
  });

  it("U14: 客戶的預約帶展演直接呼叫 action → 「僅限 老師」，不寫入", async () => {
    const result = unseal(
      await submitBooking({ ...draft, renter: { type: "customer", name: "小美" }, purpose: "performance", payment: null }),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "fields", code: "INVALID_ARGUMENT", fields: { purpose: "僅限 老師" } },
    });
    expect(data.createBatch).not.toHaveBeenCalled();
  });

  it("T10: 送出時用最新的用途設定：表單打開後用途被停用 → 「這個用途已停用」", async () => {
    data.purposeSettings = SAMPLE_PURPOSE_SETTINGS.map((s) =>
      s.purpose === "dance" ? { ...s, archivedAt: "2026-10-01T00:00:00Z" } : s,
    );
    const result = unseal(await submitBooking(draft));
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "fields", code: "INVALID_ARGUMENT", fields: { purpose: "這個用途已停用" } },
    });
    expect(data.createBatch).not.toHaveBeenCalled();
  });

  it("T09: 老師的作品班用特別價寫入 0 元、不需付款", async () => {
    await submitBooking({ ...draft, purpose: "workshop", payment: null });
    expect(data.createBatch.mock.calls[0][0][0]).toMatchObject({ paymentMethod: null, paymentState: PaymentState.NotRequired, amount: 0 });
  });

  it("S-4: 前端偽造櫃檯身分 → 用途錯誤，不寫入", async () => {
    const result = unseal(
      await submitBooking({
        ...draft,
        renter: { type: "roster", id: TEACHER.id, name: TEACHER.name, role: "staff" },
        purpose: "front_desk",
      }),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "fields", code: "INVALID_ARGUMENT", fields: { purpose: "僅限 櫃檯" } },
    });
    expect(data.createBatch).not.toHaveBeenCalled();
  });
});

describe("submitBooking: 情境2/3/5/6 — 撞單需要確認", () => {
  it("情境2: create_booking_batch 回 needs_confirm → 回傳 blockers 衝突清單，message 是確認用的句子", async () => {
    const conflict = { id: "rival-1", date: "2026-10-06", start: "14:30", end: "15:30", renterName: STAFF.name, status: RentalStatus.Pending };
    data.createBatch.mockResolvedValue({ status: "needs_confirm", conflicts: [conflict] });

    const result = unseal(await submitBooking(draft));
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "blockers",
        code: "FAILED_PRECONDITION",
        message: "這個時段跟別人的預約撞到了，請確認是否仍要送出",
        blockers: { conflicts: [conflict] },
        errorId: ERROR_ID,
      },
    });
  });

  it("情境3: acknowledgedIds 帶著看過的 id 重送，傳給 createBatch 讓資料庫判斷", async () => {
    const rivalId = "6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7";
    await submitBooking(draft, [rivalId]);
    expect(data.createBatch.mock.calls[0][1]).toEqual([rivalId]);
  });

  it("drops non-uuid acknowledgedIds before calling createBatch", async () => {
    const rivalId = "6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7";
    await submitBooking(draft, ["rival-1", "{a,b}", rivalId]);
    expect(data.createBatch.mock.calls[0][1]).toEqual([rivalId]);
  });

  it("情境5/6: 即使帶了 acknowledgedIds，createBatch 仍可能回新的 needs_confirm（例如又多了一筆，或先到的人剛寫入）", async () => {
    const newConflict = { id: "rival-2", date: "2026-10-06", start: "15:00", end: "16:00", renterName: STAFF.name, status: RentalStatus.Pending };
    data.createBatch.mockResolvedValue({ status: "needs_confirm", conflicts: [newConflict] });

    const result = unseal(await submitBooking(draft, ["rival-1"]));
    expect(result).toMatchObject({ ok: false, error: { kind: "blockers", blockers: { conflicts: [newConflict] } } });
  });

  it("每個時段卡都沒問題，確認過的衝突都在清單裡 → 寫入成功", async () => {
    data.createBatch.mockResolvedValue({ status: "created" });
    const result = unseal(await submitBooking(draft, ["rival-1"]));
    expect(result).toMatchObject({ ok: true });
  });
});

describe("submitBooking: create_booking_batch 在鎖裡發現跟自己重疊", () => {
  it("own_overlap → 跟 S-8 一樣的欄位錯誤，錯誤落在對應的那張時段卡", async () => {
    data.createBatch.mockImplementation(async (rows) => ({ status: "own_overlap", ids: [rows[1].id] }));
    const result = unseal(await submitBooking(draft));
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "fields", code: "INVALID_ARGUMENT", fields: { "slots.1": "你已經預約過這個時段" } },
    });
  });
});
