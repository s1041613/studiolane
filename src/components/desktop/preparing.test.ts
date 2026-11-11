import { describe, expect, it } from "vitest";
import { preparingTitle } from "@/components/desktop/preparing";

describe("preparingTitle", () => {
  it("titles the three parked routes by page name", () => {
    expect(preparingTitle("/settings/rules")).toBe("設定");
    expect(preparingTitle("/bookings/new")).toBe("預約教室");
    expect(preparingTitle("/bookings/batch/00000000-0000-0000-0000-000000000000")).toBe("預約明細");
  });

  it("matches any batch id, not just a well-formed uuid", () => {
    expect(preparingTitle("/bookings/batch/not-a-uuid")).toBe("預約明細");
  });

  it("returns null for every other route, closing the window", () => {
    expect(preparingTitle("/")).toBeNull();
    expect(preparingTitle("/bookings")).toBeNull();
    // Not an exact match: a sibling or nested path under the same prefix
    // shouldn't accidentally title itself 設定/預約教室.
    expect(preparingTitle("/settings/rules/extra")).toBeNull();
    expect(preparingTitle("/bookings/newer")).toBeNull();
  });
});
