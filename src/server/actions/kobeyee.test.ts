import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RentalSummary } from "@/server/types/home";
import type { RentalRule } from "@/server/logic/booking-rules";

const data = vi.hoisted(() => ({
  rentals: [] as RentalSummary[],
  rules: [] as RentalRule[],
  generateText: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/require-staff", () => ({
  requireStaff: async () => ({ id: "r-07", name: "uki", authMethod: "password" }),
}));
vi.mock("@/server/repositories/rental-repository", () => ({
  RentalRepository: class {
    listAll = async () => data.rentals;
  },
}));
vi.mock("@/server/repositories/rules-repository", () => ({
  RulesRepository: class {
    listAll = async () => data.rules;
  },
}));
vi.mock("@ai-sdk/openai", () => ({ openai: (id: string) => ({ modelId: id }) }));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: data.generateText,
}));

const { readKobeyeeMessage } = await import("@/server/actions/kobeyee");

const newRentalOutput = {
  tasks: [
    {
      intent: "new_rental",
      room: "A",
      purpose: null,
      slots: [{ date: { kind: "absolute", month: 6, day: 1, year: 2099 }, start: "10:00", end: "11:00", quote: "6/1 10-11" }],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  data.rentals = [];
  data.rules = [];
});

describe("readKobeyeeMessage", () => {
  it("turns a parse into reviews with a timeout signal and low effort", async () => {
    data.generateText.mockResolvedValue({ output: newRentalOutput });

    const result = await readKobeyeeMessage("  6/1 10-11 大教室  ");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0].intent).toBe("new_rental");
    expect(result.reviews[0].draft.room).toBe("A");
    const call = data.generateText.mock.calls[0][0];
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
    expect(call.providerOptions).toEqual({ openai: { reasoningEffort: "low" } });
  });

  it("returns unreadable for empty or oversized input without calling the model", async () => {
    expect(await readKobeyeeMessage("   ")).toEqual({ status: "unreadable" });
    expect(await readKobeyeeMessage("x".repeat(2001))).toEqual({ status: "unreadable" });
    expect(data.generateText).not.toHaveBeenCalled();
  });

  it("returns unreadable when the model finds no task", async () => {
    data.generateText.mockResolvedValue({ output: { tasks: [] } });
    expect(await readKobeyeeMessage("你好")).toEqual({ status: "unreadable" });
  });

  it("returns failed when the call throws (timeout, network, key)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    data.generateText.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    expect(await readKobeyeeMessage("6/1 10-11")).toEqual({ status: "failed" });
  });
});
