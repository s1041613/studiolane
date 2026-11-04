import { WidgetEyebrow } from "@/components/ui/widget";
import { nextFreeSlot } from "@/server/logic/desktop-widgets";
import type { RentalRule } from "@/server/logic/booking-rules";
import { roomToLabel } from "@/server/supabase/codecs";
import type { RentalSummary } from "@/server/types/home";

const ROOMS = ["A", "B"] as const;

interface FreeSlotWidgetProps {
  rentals: readonly RentalSummary[] | null;
  rules: readonly RentalRule[] | null;
  now: Date | null;
}

// 下一個空檔: per room, when the next rentable stretch of today starts;
// — when nothing is left today or the data couldn't load.
function FreeSlotWidget({ rentals, rules, now }: FreeSlotWidgetProps) {
  const ctx = rentals && rules ? { rules: [...rules], existingRentals: [...rentals] } : null;

  return (
    <div className="flex h-full flex-col">
      <WidgetEyebrow tone="time">下一個空檔</WidgetEyebrow>
      <dl className="mt-1.5 flex flex-col gap-1.5">
        {ROOMS.map((room) => {
          const slot = ctx && now ? nextFreeSlot(room, now, ctx) : null;
          return (
            <div key={room}>
              <dt className="text-[12px] font-semibold">{roomToLabel(room)}</dt>
              <dd className="text-[21px] leading-tight font-semibold tracking-[-0.02em] text-white/85">
                {slot ? slot.start : "—"}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export { FreeSlotWidget };
