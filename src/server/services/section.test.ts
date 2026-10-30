import { describe, expect, it, vi } from "vitest";
import { loadSection } from "@/server/services/section";

const ERROR_ID = expect.stringMatching(/^[0-9a-f]{8}$/);

describe("loadSection", () => {
  it("returns the read's data when it succeeds", async () => {
    const result = await loadSection(async () => ["room-1", "room-2"]);

    expect(result).toEqual({ ok: true, data: ["room-1", "room-2"] });
  });

  it("degrades to its own UNEXPECTED_READ failure instead of throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await loadSection(async () => {
      throw new Error("connection refused");
    });

    expect(result).toEqual({
      ok: false,
      error: { kind: "message", code: "INTERNAL", message: "暫時讀不到資料，請稍後再試一次", errorId: ERROR_ID },
    });
  });
});
