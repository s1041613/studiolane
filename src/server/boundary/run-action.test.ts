import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { fail, failFields, ok, unseal } from "@/lib/result";
import { refuse } from "@/server/audit/refusal";
import { AuthError } from "@/server/auth/messages";

const requireStaff = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/server/auth/require-staff", () => ({ requireStaff: (opts: unknown) => requireStaff(opts) }));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { runAction, runFormAction } = await import("@/server/boundary/run-action");

const ERROR_ID = expect.stringMatching(/^[0-9a-f]{8}$/);
const spec = { attempted: "確認預約", access: "staff", revalidate: ["/bookings"] } as const;

beforeEach(() => {
  requireStaff.mockReset();
  requireStaff.mockResolvedValue({ id: "r-07", name: "uki", authMethod: "password" });
  revalidatePath.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("runAction", () => {
  it("hands the body the signed-in staff and refreshes after a success", async () => {
    const result = unseal(await runAction(spec, async (actor) => ok(actor.name)));

    expect(result).toEqual({ ok: true, data: "uki" });
    expect(revalidatePath).toHaveBeenCalledWith("/bookings");
  });

  it("adds an errorId to a returned failure and refreshes nothing", async () => {
    const result = unseal(await runAction(spec, async () => fail("NOT_FOUND", "找不到這筆預約")));

    expect(result).toEqual({
      ok: false,
      error: { kind: "message", code: "NOT_FOUND", message: "找不到這筆預約", errorId: ERROR_ID },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/^\[op:[0-9a-f]{8}\] 確認預約 refused \(NOT_FOUND\): 找不到這筆預約$/));
  });

  it("returns a refuse() from deeper in, fields included", async () => {
    const result = unseal(
      await runAction(spec, async () => {
        refuse(failFields({ name: "名稱重複" }).error);
      }),
    );

    expect(result).toMatchObject({ ok: false, error: { kind: "fields", fields: { name: "名稱重複" }, errorId: ERROR_ID } });
  });

  it("never shows a thrown message, only our own words", async () => {
    const result = unseal(
      await runAction(spec, async () => {
        throw new Error("讀取租借資料失敗：JWT expired", { cause: new Error("JWT expired") });
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: { kind: "message", code: "INTERNAL", message: "系統發生未預期的錯誤，資料沒有改變", errorId: ERROR_ID },
    });
  });

  it("says a failed read changed nothing to begin with", async () => {
    const result = unseal(
      await runAction({ ...spec, effect: "read" }, async () => {
        throw new Error("boom");
      }),
    );

    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL", message: "暫時讀不到資料，請稍後再試一次" } });
  });

  it("treats a coded error that is not a database error as unexpected", async () => {
    const result = unseal(
      await runAction(spec, async () => {
        throw Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" });
      }),
    );

    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL", message: "系統發生未預期的錯誤，資料沒有改變" } });
  });

  it("classifies a database error by its SQLSTATE", async () => {
    const pg = Object.assign(new Error("duplicate key value"), { code: "23505" });
    const result = unseal(
      await runAction(spec, async () => {
        throw new Error("Failed query", { cause: pg });
      }),
    );

    expect(result).toMatchObject({ ok: false, error: { code: "ALREADY_EXISTS", message: "這筆資料已經存在，不能重複新增" } });
  });

  it("lets a redirect() from the body through to Next", async () => {
    await expect(
      runAction(spec, async () => {
        redirect("/bookings/batch/b-1");
      }),
    ).rejects.toSatisfy(isRedirectError);
  });

  it("D4: sends a signed-out caller to the login page without running the body", async () => {
    requireStaff.mockRejectedValue(new AuthError("UNAUTHENTICATED"));
    const run = vi.fn();

    await expect(runAction(spec, run)).rejects.toSatisfy(isRedirectError);
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses a non-admin on an ADMIN_PAGES page with PERMISSION_DENIED", async () => {
    requireStaff.mockRejectedValue(new AuthError("PERMISSION_DENIED"));

    const result = unseal(await runAction({ ...spec, access: { adminPage: "/settings/rules" } }, vi.fn()));

    expect(requireStaff).toHaveBeenCalledWith({ page: "/settings/rules" });
    expect(result).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED", errorId: ERROR_ID } });
  });

  it("reports a sign-in check that could not run as unavailable, not as signed out", async () => {
    requireStaff.mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));

    const result = unseal(await runAction(spec, vi.fn()));

    expect(result).toMatchObject({ ok: false, error: { code: "UNAVAILABLE", message: "資料庫暫時連不上，請稍後再試一次" } });
  });
});

describe("runFormAction", () => {
  it("lets anyone in, with no actor", async () => {
    const result = await runFormAction({ attempted: "登入", access: "anyone" }, async (actor) => ok(actor));

    expect(result).toEqual({ ok: true, data: null });
    expect(requireStaff).not.toHaveBeenCalled();
  });
});
