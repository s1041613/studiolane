import { describe, expect, expectTypeOf, it } from "vitest";
import { countFieldErrors, fail, failBlockers, failFields, ok, seal, unseal } from "@/lib/result";
import type { Outcome, Problem, Sealed } from "@/lib/result";

describe("builders", () => {
  it("ok() carries null when there is no data", () => {
    expect(ok()).toEqual({ ok: true, data: null });
    expect(ok("已儲存")).toEqual({ ok: true, data: "已儲存" });
  });

  it("fail() is one sentence with its code", () => {
    expect(fail("NOT_FOUND", "找不到這筆預約")).toEqual({
      ok: false,
      error: { kind: "message", code: "NOT_FOUND", message: "找不到這筆預約" },
    });
  });

  it("failFields() is always INVALID_ARGUMENT and counts the flat map's fields for its default sentence", () => {
    const result = failFields({ renter: "請選租借人", "slots.0": "請填開始時間" });
    expect(result.error).toMatchObject({ kind: "fields", code: "INVALID_ARGUMENT", message: "有 2 個地方需要修改" });
    expect(failFields({ name: "名稱重複" }, "這個名稱已經有人用了").error.message).toBe("這個名稱已經有人用了");
  });

  it("failBlockers() keeps the action's own payload", () => {
    expect(failBlockers("FAILED_PRECONDITION", "跟 1 筆預約時間重疊", ["r1"]).error).toEqual({
      kind: "blockers",
      code: "FAILED_PRECONDITION",
      message: "跟 1 筆預約時間重疊",
      blockers: ["r1"],
    });
  });

  it("countFieldErrors() ignores undefined entries", () => {
    expect(countFieldErrors({ a: "x", b: undefined, "c.0": "y", "c.1": "z" })).toBe(3);
  });

  it("seal() and unseal() leave the object as it is", () => {
    const result = { ok: true as const, data: 1 };
    expect(unseal(seal(result))).toBe(result);
  });
});

describe("types", () => {
  it("offers only the reactions an operation declares", () => {
    expectTypeOf<Problem["kind"]>().toEqualTypeOf<"message">();
    expectTypeOf<Problem<{ fields: { name?: string } }>["kind"]>().toEqualTypeOf<"message" | "fields">();
    expectTypeOf<Problem<{ blockers: string[] }>["kind"]>().toEqualTypeOf<"message" | "blockers">();
  });

  it("accepts every builder as an Outcome", () => {
    const outcomes: Outcome<string, { fields: { name?: string }; blockers: string[] }>[] = [
      ok("x"),
      fail("INTERNAL", "x"),
      failFields({ name: "x" }),
      failBlockers("ABORTED", "x", ["y"]),
    ];
    expect(outcomes).toHaveLength(4);
  });

  it("hides a sealed result's fields", () => {
    // @ts-expect-error a Sealed result can only be read through settle()
    expect((seal(ok()) satisfies Sealed).ok).toBe(true);
  });
});
