import { cn } from "cn";
import { WidgetEyebrow, WidgetFlag } from "@/components/ui/widget";
import { rentalPhase, needsAttention, selectTodayRentals, spotlightRental } from "@/server/logic/desktop-widgets";
import { shortDateParts, todayIso, weekdayZh } from "@/server/logic/date";
import { roomToLabel, statusToLabel } from "@/server/supabase/codecs";
import { RentalStatus } from "@/server/types/home";
import type { RentalSummary } from "@/server/types/home";

interface TodayWidgetProps {
  rentals: readonly RentalSummary[] | null;
  now: Date | null;
}

// 今日教室: today's rentals as one time-ordered list. Finished rows dim, the
// running (or next) row is tinted, 待確認/待付款 is named after the renter.
function TodayWidget({ rentals, now }: TodayWidgetProps) {
  const today = todayIso(now ?? undefined);
  const { monthDay } = shortDateParts(today);
  const rows = rentals ? selectTodayRentals(rentals, today) : [];
  const pendingCount = rows.filter((rental) => rental.status === RentalStatus.Pending).length;
  const spotlight = now ? spotlightRental(rows, now) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <WidgetEyebrow tone="today">
          週{weekdayZh(today)} {monthDay}
        </WidgetEyebrow>
        {rentals && (
          <p className="text-[12.5px] text-[rgba(60,60,67,0.78)]">
            {rows.length} 筆預約{pendingCount > 0 && `・${pendingCount} 筆待確認`}
          </p>
        )}
      </div>
      {!rentals || rows.length === 0 ? (
        <p className="grid flex-1 place-items-center text-[22px] text-[rgba(60,60,67,0.5)]">—</p>
      ) : (
        <ul className="-mx-4 mt-2.5 min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4">
          {rows.map((rental) => (
            <li
              key={rental.id}
              className={cn(
                "flex items-baseline gap-2.5 py-[7px] text-[13px] not-first:shadow-[0_-0.5px_0_rgba(60,60,67,0.14)]",
                now && rentalPhase(rental, now) === "past" && "opacity-[0.42]",
                rental === spotlight && "-mx-4 rounded-[10px] bg-[rgba(10,107,224,0.12)] px-4",
              )}
            >
              <span className="w-[84px] flex-none font-medium text-[rgba(60,60,67,0.78)]">
                {rental.start}–{rental.end}
              </span>
              <span className={cn("min-w-0 flex-1 truncate font-semibold", rental === spotlight && "font-bold")}>
                {rental.person}
              </span>
              {needsAttention(rental) && (
                <WidgetFlag>{statusToLabel(rental.status)}</WidgetFlag>
              )}
              <span className="flex-none text-[12px] text-[rgba(60,60,67,0.5)]">{roomToLabel(rental.room)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export { TodayWidget };
