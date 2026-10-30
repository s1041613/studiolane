import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AffectedRentals } from "@/components/shared/rentals/affected-rentals";
import { makeRental } from "@/server/logic/test-fixtures";
import { RentalStatus } from "@/server/types/home";

const HEADING = "這些預約還沒付款，金額不會自動更新";

function listItems(html: string): string[] {
  return [...html.matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1]);
}

describe("AffectedRentals", () => {
  it("SH07 / T07: shows the heading and one line per booking, soonest first", () => {
    const html = renderToStaticMarkup(
      <AffectedRentals
        heading={HEADING}
        rentals={[
          makeRental({ id: "late", date: "2026-10-18", person: "示範小橘", amount: 500, status: RentalStatus.AwaitingPayment }),
          makeRental({ id: "early", date: "2026-10-15", start: "18:00", end: "20:00", person: "示範小雨", amount: 1000 }),
        ]}
      />,
    );
    expect(html).toContain(HEADING);
    const items = listItems(html);
    expect(items).toHaveLength(2);
    expect(items[0]).toBe("2026-10-15 18:00–20:00 示範小雨 大教室 A · 1,000（待確認）");
    expect(items[1]).toContain("示範小橘");
    expect(items[1]).toContain("（待付款）");
  });

  it("SH08 / T08: lists every booking without an overflow line", () => {
    const rentals = Array.from({ length: 14 }, (_, i) =>
      makeRental({ id: `r${i}`, date: `2026-10-${String(10 + i).padStart(2, "0")}` }),
    );
    const html = renderToStaticMarkup(<AffectedRentals heading={HEADING} rentals={rentals} />);
    const items = listItems(html);
    expect(items).toHaveLength(14);
    expect(items[13]).toContain("2026-10-23");
    expect(html).not.toContain("還有");
  });

  it("SH09 / T09: renders nothing when no booking is affected", () => {
    expect(renderToStaticMarkup(<AffectedRentals heading={HEADING} rentals={[]} />)).toBe("");
  });
});
