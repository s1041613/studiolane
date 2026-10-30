import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RentalRule, RuleInput } from "@/server/logic/booking-rules";
import type { RuleDraft } from "@/server/logic/rental-rule-form";
import { unseal } from "@/lib/result";
import { RentalStatus } from "@/server/types/home";
import { SAMPLE_RULES, makeRental, oneDayRule } from "@/server/logic/test-fixtures";

const ERROR_ID = expect.stringMatching(/^[0-9a-f]{8}$/);
// require-staff.ts is a stub that always signs in this demo admin.
const UPDATED_BY = "示範管理員";

const data = vi.hoisted(() => ({
  rules: [] as RentalRule[],
  rentals: [] as unknown[],
  create: vi.fn<(inputs: readonly RuleInput[], by: string) => Promise<unknown>>(async () => []),
  update: vi.fn<(id: string, input: RuleInput, by: string) => Promise<unknown>>(async () => ({})),
  setArchived: vi.fn<(id: string, at: string | null, by: string) => Promise<unknown>>(async () => ({})),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: data.revalidatePath }));
vi.mock("@/server/repositories/rules-repository", () => ({
  RulesRepository: class {
    listAll = async () => data.rules;
    create = data.create;
    update = data.update;
    setArchived = data.setArchived;
  },
}));
vi.mock("@/server/repositories/rental-repository", () => ({
  RentalRepository: class {
    listAll = async () => data.rentals;
  },
}));

const { archiveRentalRule, createRentalRules, previewRuleArchive, previewRuleOverlaps, reactivateRentalRule, updateRentalRule } = await import(
  "@/server/actions/rental-rules"
);

function draft(overrides: Partial<RuleDraft> = {}): RuleDraft {
  return {
    rooms: ["A"],
    mode: "date",
    weekdays: [],
    onDate: "2026-11-22",
    effect: "block",
    start: "12:00",
    end: "14:00",
    reason: "臨時封教室",
    ...overrides,
  };
}

const ruleById = (id: string) => data.rules.find((r) => r.id === id)!;
const registered = (id: string, date: string, start: string, end: string) =>
  makeRental({ id, room: "A", date, start, end, status: RentalStatus.Registered });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T10:00:00+08:00"));
  data.rules = SAMPLE_RULES;
  data.rentals = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("createRentalRules", () => {
  it("N04: one row per weekday, stamped with who saved them", async () => {
    const result = unseal(
      await createRentalRules(
        draft({ mode: "weekly", weekdays: [1, 2, 3, 4], onDate: "", start: "06:00", end: "08:00", reason: "晨間保養" }),
      ),
    );
    expect(result).toEqual({ ok: true, data: "已新增 4 筆租借規則" });
    const [inputs, by] = data.create.mock.calls[0];
    expect(inputs.map((i: RuleInput) => i.weekday)).toEqual([1, 2, 3, 4]);
    expect(inputs.every((i: RuleInput) => i.kind === "rental" && i.effect === "block")).toBe(true);
    expect(by).toBe(UPDATED_BY);
    expect(data.revalidatePath.mock.calls.map(([path]: unknown[]) => path)).toEqual(["/settings/rules", "/bookings/new"]);
  });

  it("validates again on the server", async () => {
    expect(unseal(await createRentalRules(draft({ start: "13:35" })))).toEqual({
      ok: false,
      error: { kind: "fields", code: "INVALID_ARGUMENT", message: "有 1 個地方需要修改", fields: { time: "時間要以 10 分鐘為單位" }, errorId: ERROR_ID },
    });
    expect(data.create).not.toHaveBeenCalled();
  });

  it("an action called directly with a malformed draft is refused, not thrown", async () => {
    expect(unseal(await createRentalRules(draft({ rooms: ["A", "A"] })))).toEqual({
      ok: false,
      error: { kind: "fields", code: "INVALID_ARGUMENT", message: "有 1 個地方需要修改", fields: { rooms: "請選教室" }, errorId: ERROR_ID },
    });
    expect(unseal(await createRentalRules(draft({ start: "13:30", end: "13:00" })))).toEqual({
      ok: false,
      error: { kind: "fields", code: "INVALID_ARGUMENT", message: "有 1 個地方需要修改", fields: { time: "結束要晚於開始" }, errorId: ERROR_ID },
    });
    expect(data.create).not.toHaveBeenCalled();
  });

  it("AC22: a weekly 可租 sent straight to the action is refused", async () => {
    expect(unseal(await createRentalRules(draft({ mode: "weekly", weekdays: [1], onDate: "", effect: "open" })))).toEqual({
      ok: false,
      error: { kind: "fields", code: "INVALID_ARGUMENT", message: "有 1 個地方需要修改", fields: { form: "每週的規則只能不可租" }, errorId: ERROR_ID },
    });
    expect(data.create).not.toHaveBeenCalled();
  });

  it("N09: refuses a row identical to an active one", async () => {
    const result = unseal(
      await createRentalRules(draft({ mode: "weekly", weekdays: [1], onDate: "", start: "06:00", end: "13:30", reason: "平日白天" })),
    );
    expect(result).toEqual({ ok: false, error: { kind: "message", code: "ALREADY_EXISTS", message: "已經有一樣的租借時段", errorId: ERROR_ID } });
    expect(data.create).not.toHaveBeenCalled();
  });

  it("AC28: a block over an existing booking is refused with that booking", async () => {
    const hit = registered("hit", "2026-11-22", "12:00", "13:00");
    data.rentals = [hit, registered("miss", "2026-11-22", "15:00", "16:00")];
    expect(unseal(await createRentalRules(draft()))).toEqual({
      ok: false,
      error: {
        kind: "blockers",
        code: "FAILED_PRECONDITION",
        message: "這段時間有 1 筆預約，不能存",
        blockers: { conflicts: [hit] },
        errorId: ERROR_ID,
      },
    });
    expect(data.create).not.toHaveBeenCalled();
  });

  it("AC29: once that booking is cancelled the block saves", async () => {
    data.rentals = [makeRental({ id: "gone", room: "A", date: "2026-11-22", start: "12:00", end: "13:00", status: RentalStatus.Cancelled })];
    expect(unseal(await createRentalRules(draft()))).toMatchObject({ ok: true });
  });

  it("reports a failed write instead of throwing, without the raw error text", async () => {
    data.create.mockRejectedValueOnce(new Error("boom"));
    expect(unseal(await createRentalRules(draft()))).toEqual({
      ok: false,
      error: { kind: "message", code: "INTERNAL", message: "系統發生未預期的錯誤，資料沒有改變", errorId: ERROR_ID },
    });
    expect(data.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("updateRentalRule", () => {
  it("T10 N10: changes only that row", async () => {
    const result = unseal(
      await updateRentalRule("R3-5", draft({ mode: "weekly", weekdays: [5], onDate: "", start: "06:00", end: "12:00", reason: "平日白天" })),
    );
    expect(result).toEqual({ ok: true, data: "已儲存" });
    expect(data.update).toHaveBeenCalledTimes(1);
    expect(data.update.mock.calls[0][0]).toBe("R3-5");
    expect(data.update.mock.calls[0][1]).toMatchObject({ kind: "rental", weekday: 5, end: "12:00" });
  });

  it("AC30: lengthening 平日白天 over a booking is refused", async () => {
    const hit = registered("r8", "2026-10-21", "13:30", "15:00");
    data.rentals = [hit];
    const result = unseal(
      await updateRentalRule("R3-3", draft({ mode: "weekly", weekdays: [3], onDate: "", start: "06:00", end: "15:00", reason: "平日白天" })),
    );
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "blockers",
        code: "FAILED_PRECONDITION",
        message: "這段時間有 1 筆預約，不能存",
        blockers: { conflicts: [hit] },
        errorId: ERROR_ID,
      },
    });
    expect(data.update).not.toHaveBeenCalled();
  });

  it("refuses a duplicate of another row but not of itself", async () => {
    expect(
      unseal(await updateRentalRule("R3-1", draft({ mode: "weekly", weekdays: [2], onDate: "", start: "06:00", end: "13:30", reason: "平日白天" }))),
    ).toEqual({ ok: false, error: { kind: "message", code: "ALREADY_EXISTS", message: "已經有一樣的租借時段", errorId: ERROR_ID } });
    expect(
      unseal(await updateRentalRule("R3-1", draft({ mode: "weekly", weekdays: [1], onDate: "", start: "06:00", end: "13:30", reason: "早上不開放" }))),
    ).toMatchObject({ ok: true });
  });

  it("an unknown row, or a 上課時段 row, is reported as not found", async () => {
    expect(unseal(await updateRentalRule("nope", draft()))).toEqual({
      ok: false,
      error: { kind: "message", code: "NOT_FOUND", message: "找不到這筆租借規則，請重新整理", errorId: ERROR_ID },
    });
    expect(unseal(await updateRentalRule("R1-1", draft()))).toEqual({
      ok: false,
      error: { kind: "message", code: "NOT_FOUND", message: "找不到這筆租借規則，請重新整理", errorId: ERROR_ID },
    });
  });
});

describe("archive / reactivate", () => {
  it("T11 N11: archives only that row", async () => {
    expect(unseal(await archiveRentalRule("R3-3"))).toEqual({ ok: true, data: "已停用" });
    expect(data.setArchived).toHaveBeenCalledTimes(1);
    expect(data.setArchived.mock.calls[0][0]).toBe("R3-3");
    expect(data.setArchived.mock.calls[0][1]).toEqual(expect.any(String));
  });

  it("AC26: an opening with a booking inside can't be archived", async () => {
    const open = oneDayRule("open-1213", "2026-12-13", { room: "A", start: "13:30", end: "22:30", effect: "open", reason: "成發停課" });
    const hit = registered("r6", "2026-12-13", "18:00", "20:00");
    data.rules = [...SAMPLE_RULES, open];
    data.rentals = [hit];
    expect(unseal(await archiveRentalRule("open-1213"))).toEqual({
      ok: false,
      error: {
        kind: "blockers",
        code: "FAILED_PRECONDITION",
        message: "這段時間有 1 筆預約，不能停用",
        blockers: { conflicts: [hit] },
        errorId: ERROR_ID,
      },
    });
    expect(unseal(await previewRuleArchive("open-1213", true))).toEqual({ ok: true, data: { rentals: [hit] } });
    expect(data.setArchived).not.toHaveBeenCalled();
  });

  it("T11: reactivates the row", async () => {
    data.rules = SAMPLE_RULES.map((r) => (r.id === "R3-3" ? { ...r, archivedAt: "2026-10-01T00:00:00Z" } : r));
    expect(unseal(await reactivateRentalRule("R3-3"))).toEqual({ ok: true, data: "已啟用" });
    expect(data.setArchived.mock.calls[0][1]).toBeNull();
  });

  it("AC31: reactivating a block over a booking is refused", async () => {
    const block = oneDayRule("block-1206", "2026-12-06", {
      room: "A", start: "10:00", end: "11:00", reason: "場地布置", archivedAt: "2026-10-01T00:00:00Z",
    });
    const hit = registered("r9", "2026-12-06", "10:00", "11:00");
    data.rules = [...SAMPLE_RULES, block];
    data.rentals = [hit];
    expect(unseal(await reactivateRentalRule("block-1206"))).toEqual({
      ok: false,
      error: {
        kind: "blockers",
        code: "FAILED_PRECONDITION",
        message: "這段時間有 1 筆預約，不能啟用",
        blockers: { conflicts: [hit] },
        errorId: ERROR_ID,
      },
    });
  });

  it("reactivating is refused when an identical active row exists", async () => {
    const copy = { ...ruleById("R3-3"), id: "copy", archivedAt: "2026-10-01T00:00:00Z" };
    data.rules = [...SAMPLE_RULES, copy];
    expect(unseal(await reactivateRentalRule("copy"))).toEqual({
      ok: false,
      error: { kind: "message", code: "ALREADY_EXISTS", message: "已經有一樣的租借時段", errorId: ERROR_ID },
    });
  });
});

describe("previewRuleOverlaps (I-03)", () => {
  it("N08: lists the bookings a block would break", async () => {
    const hit = registered("hit", "2026-11-22", "12:00", "13:00");
    data.rentals = [hit, registered("miss", "2026-11-22", "15:00", "16:00")];
    expect(unseal(await previewRuleOverlaps(draft()))).toEqual({ ok: true, data: [hit] });
  });

  it("editing compares against the row's own old values", async () => {
    // 平日白天 週三 already blocks 10:00; editing it to the same time breaks nothing.
    data.rentals = [registered("x", "2026-10-21", "10:00", "11:00")];
    const same = draft({ mode: "weekly", weekdays: [3], onDate: "", start: "06:00", end: "13:30", reason: "平日白天" });
    expect(unseal(await previewRuleOverlaps(same, "R3-3"))).toEqual({ ok: true, data: [] });
  });

  it("an incomplete draft has nothing to show", async () => {
    expect(unseal(await previewRuleOverlaps(draft({ end: "" })))).toEqual({ ok: true, data: [] });
  });

  it("a malformed draft (still being typed) has nothing to show either", async () => {
    expect(unseal(await previewRuleOverlaps(draft({ rooms: ["A", "A"] })))).toEqual({ ok: true, data: [] });
  });
});
