import { describe, expect, it } from "vitest";
import { failBlockers, failFields } from "@/lib/result";
import { Refused, refuse } from "@/server/audit/refusal";

function caught(run: () => unknown): Refused {
  try {
    run();
  } catch (error) {
    if (error instanceof Refused) return error;
    throw error;
  }
  throw new Error("expected a throw");
}

describe("refuse", () => {
  it("turns a code and a sentence into a message problem that reads as that sentence", () => {
    const error = caught(() => refuse("INVALID_ARGUMENT", "特別課至少要有一個日期"));

    expect(error.problem).toEqual({ kind: "message", code: "INVALID_ARGUMENT", message: "特別課至少要有一個日期" });
    expect(error.message).toBe("特別課至少要有一個日期");
    expect(error.name).toBe("Refused");
  });

  it("carries a whole problem, field errors or blockers included, as given", () => {
    const fields = failFields({ name: "名稱重複" }).error;
    expect(caught(() => refuse(fields)).problem).toBe(fields);
    const blockers = failBlockers("FAILED_PRECONDITION", "撞單", ["R1"]).error;
    expect(caught(() => refuse(blockers)).problem).toBe(blockers);
  });
});
