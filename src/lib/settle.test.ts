import { describe, expect, it, vi } from "vitest";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { fail, ok, seal } from "@/lib/result";
import { NETWORK_FAILURE, STALE_CLIENT_FAILURE, settle } from "@/lib/settle";

describe("settle", () => {
  it("passes the server's answer through", async () => {
    await expect(settle(Promise.resolve(seal(ok("已儲存"))))).resolves.toEqual({ ok: true, data: "已儲存" });
    const refused = { ok: false as const, error: { ...fail("NOT_FOUND", "找不到").error, errorId: "1a2b3c4d" } };
    await expect(settle(Promise.resolve(seal(refused)))).resolves.toBe(refused);
  });

  it("turns a request that never got an answer into a network failure", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(settle(Promise.reject(new TypeError("Failed to fetch")))).resolves.toEqual({
      ok: false,
      error: NETWORK_FAILURE,
    });
  });

  it("asks for a reload when a deploy replaced the action", async () => {
    await expect(settle(Promise.reject(new UnrecognizedActionError("gone")))).resolves.toEqual({
      ok: false,
      error: STALE_CLIENT_FAILURE,
    });
  });

  it("hands redirect() back to Next instead of reporting it as a failure", async () => {
    let thrown: unknown;
    try {
      redirect("/login?reason=expired");
    } catch (error) {
      thrown = error;
    }
    const settled = settle(Promise.reject(thrown));
    await expect(settled).rejects.toBe(thrown);
    expect(isRedirectError(thrown)).toBe(true);
  });
});
