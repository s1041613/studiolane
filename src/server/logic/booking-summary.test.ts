import { describe, expect, it } from "vitest";
import { summarizeBatch } from "@/server/logic/booking-summary";
import { PaymentMethod, PaymentState, RentalStatus } from "@/server/types/home";
import { makeRental } from "@/server/logic/test-fixtures";

const base = {
  batchId: "batch-1",
  room: "B" as const,
  person: "王小明",
  renterType: "customer" as const,
  purpose: "dance",
  purposeLabel: "舞蹈",
  paymentMethod: PaymentMethod.Transfer,
  paymentMethodLabel: "轉帳",
  note: "",
};

describe("送出成功後的明細", () => {
  it("沒有資料 → null", () => {
    expect(summarizeBatch([])).toBeNull();
  });

  it("S-完成-2: 送出了幾筆、目前狀態", () => {
    const summary = summarizeBatch([
      makeRental({ ...base, id: "a", date: "2026-10-13", start: "15:00", end: "17:00", amount: 1000 }),
      makeRental({ ...base, id: "b", date: "2026-10-14", start: "15:00", end: "16:00", amount: 500 }),
    ]);
    expect(summary).toMatchObject({ count: 2, statusLabel: "待確認" });
  });

  it("S-完成-2: 各筆狀態不同時，標題不寫單一狀態，改看每一列", () => {
    const summary = summarizeBatch([
      makeRental({ ...base, id: "a", date: "2026-10-13", amount: 1000 }),
      makeRental({ ...base, id: "b", date: "2026-10-14", amount: 500, status: RentalStatus.Cancelled }),
    ]);
    expect(summary?.statusLabel).toBeNull();
    expect(summary?.rows.map((r) => r.statusLabel)).toEqual(["待確認", "已取消"]);
  });

  it("S-完成-3: 共同資料：租借人（外部客戶標示）、教室、用途、付款方式、備註", () => {
    const summary = summarizeBatch([
      makeRental({ ...base, id: "a", date: "2026-10-13", amount: 1000, note: "第一次來" }),
    ]);
    expect(summary).toMatchObject({
      renter: "王小明（外部客戶）",
      roomLabel: "小教室 B",
      purposeLabel: "舞蹈",
      paymentLabel: "轉帳",
      note: "第一次來",
    });
  });

  it("S-完成-3: 免費用途的付款方式顯示「無需付款」", () => {
    const summary = summarizeBatch([
      makeRental({
        ...base, id: "a", date: "2026-10-13", purpose: "performance", purposeLabel: "展演",
        paymentMethod: null, paymentMethodLabel: "—", paymentState: PaymentState.NotRequired, amount: 0,
      }),
    ]);
    expect(summary?.paymentLabel).toBe("無需付款");
  });

  it("S-完成-4: 每個時段一列（依時間排序、跨日標示、時數、金額），最下面是合計", () => {
    const summary = summarizeBatch([
      makeRental({ ...base, id: "late", date: "2026-10-14", start: "22:30", end: "00:30", isCrossMidnight: true, amount: 1000 }),
      makeRental({ ...base, id: "early", date: "2026-10-13", start: "15:00", end: "17:00", amount: 1000 }),
    ]);
    expect(summary?.rows).toEqual([
      expect.objectContaining({ id: "early", dateLabel: "10/13（二）", time: "15:00–17:00", isCrossMidnight: false, hours: 2, amount: 1000 }),
      expect.objectContaining({ id: "late", dateLabel: "10/14（三）", time: "22:30–00:30", isCrossMidnight: true, hours: 2, amount: 1000 }),
    ]);
    expect(summary).toMatchObject({ totalHours: 4, totalAmount: 2000 });
  });
});
