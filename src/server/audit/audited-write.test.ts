import { describe, expect, it } from "vitest";
import { auditedWrite } from "@/server/audit/audited-write";

describe("auditedWrite", () => {
  it("returns the write's value", async () => {
    await expect(auditedWrite(() => Promise.resolve("row"))).resolves.toBe("row");
  });

  it("passes a rejection through unchanged", async () => {
    const error = new Error("write failed");
    await expect(auditedWrite(() => Promise.reject(error))).rejects.toBe(error);
  });
});
