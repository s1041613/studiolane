import { describe, expect, it } from "vitest";
import { classifyDbError } from "@/server/boundary/db-errors";

describe("classifyDbError", () => {
  it("classifies a unique violation (23505) as duplicate", () => {
    const pg = Object.assign(new Error("duplicate key value"), { code: "23505", constraint: "rooms_name_key" });

    expect(classifyDbError(pg)).toMatchObject({ kind: "duplicate", code: "23505", constraint: "rooms_name_key" });
  });

  it("classifies a socket error as unavailable", () => {
    const socket = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });

    expect(classifyDbError(socket)).toMatchObject({ kind: "unavailable", code: "ECONNREFUSED" });
  });

  it("classifies anything else as unknown, keeping the original error for the log", () => {
    const original = new Error("boom");

    expect(classifyDbError(original)).toMatchObject({ kind: "unknown", code: null, constraint: null, cause: original });
  });
});
