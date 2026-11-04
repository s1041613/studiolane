import { WidgetEyebrow } from "@/components/ui/widget";
import { countAwaitingPayment } from "@/server/logic/desktop-widgets";
import type { RentalSummary } from "@/server/types/home";

// 待付款: how many rentals sit in status 待付款, whatever their date.
function UnpaidWidget({ rentals }: { rentals: readonly RentalSummary[] | null }) {
  return (
    <div className="flex h-full flex-col">
      <WidgetEyebrow tone="money">待付款</WidgetEyebrow>
      <p className="mt-1 text-[52px] leading-none font-semibold tracking-[-0.03em] text-white">
        {rentals ? countAwaitingPayment(rentals) : "—"}
      </p>
      <p className="mt-1 text-[13px]">筆</p>
    </div>
  );
}

export { UnpaidWidget };
