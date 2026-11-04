"use client";

import type { ReactNode } from "react";
import { RoomPicker } from "@/components/booking/room-picker";
import { MultiDatePicker } from "@/components/booking/multi-date-picker";
import { SlotCard } from "@/components/booking/slot-card";
import { PurposePicker } from "@/components/booking/purpose-picker";
import { PaymentPicker } from "@/components/booking/payment-picker";
import { PersonPicker } from "@/components/shared/people/person-picker";
import { Textarea } from "@/components/ui/textarea";
import { checkBooking, isDateDisabled } from "@/server/logic/booking-rules";
import { defaultPurposeFor, purposeOptions } from "@/server/logic/purpose-rules";
import type { PurposeSetting } from "@/server/logic/purpose-rules";
import { hourlyRate, quoteSlot } from "@/server/logic/pricing";
import type { PricingPlan, RosterEntry } from "@/server/logic/pricing";
import type { RentalRule } from "@/server/logic/booking-rules";
import type { BookingDraft, IsoDate, RenterSelection } from "@/server/logic/booking";
import { DRAFT_FIELDS, type DraftField } from "@/server/logic/kobeyee";
import { todayIso } from "@/server/logic/date";
import { money } from "@/server/logic/home-selectors";
import { purposeToLabel } from "@/server/supabase/codecs";
import type { RentalSummary } from "@/server/types/home";

export interface BookingDraftFieldsData {
  rules: RentalRule[];
  roster: RosterEntry[];
  plans: PricingPlan[];
  existingRentals: RentalSummary[];
  purposeSettings: PurposeSetting[];
}

interface BookingDraftFieldsProps {
  draft: BookingDraft;
  onDraftChange: (draft: BookingDraft) => void;
  // Rows at or past this index in DRAFT_FIELDS render as skeletons.
  revealed: number;
  data: BookingDraftFieldsData;
}

function Row({ field, label, revealed, children }: { field: DraftField; label: string; revealed: number; children: ReactNode }) {
  const shown = DRAFT_FIELDS.indexOf(field) < revealed;
  return (
    <div data-field={field} className="grid grid-cols-[5.5rem_1fr] items-start gap-x-6 py-2.5">
      <span className="pt-1.5 text-sm text-muted-foreground">{label}</span>
      {shown ? <div className="min-w-0">{children}</div> : <div aria-hidden="true" className="h-8 w-3/5 animate-pulse rounded-md bg-foreground/5" />}
    </div>
  );
}

function renterLabel(renter: RenterSelection | null): string {
  if (!renter) return "";
  return renter.type === "roster" ? renter.name : `${renter.name}（外部客戶）`;
}

// A controlled BookingDraft editor. Prices and the payment row wait for a
// renter, since the rate depends on who is renting.
export function BookingDraftFields({ draft, onDraftChange, revealed, data }: BookingDraftFieldsProps) {
  const { renter, room, slots, purpose } = draft;
  const ctx = data;
  const today = todayIso();
  const role = renter ? (renter.type === "roster" ? renter.role : "customer") : null;
  const purposeChoices = role ? purposeOptions(data.purposeSettings, role) : null;
  const rate = renter && purpose ? hourlyRate({ renter, purpose, room }, ctx) : null;
  const isFree = rate?.ok === true && rate.rate === 0;

  const slotViews = slots.map((slot) => {
    const check = slot.start && slot.end ? checkBooking(slot, room, ctx) : null;
    const quote = check?.ok && renter && purpose ? quoteSlot({ renter, purpose, room, slot }, ctx) : null;
    return { slot, error: check && !check.ok ? check.reason : null, quote: quote?.ok ? quote : null };
  });
  const totalAmount = slotViews.reduce((sum, v) => sum + (v.quote?.amount ?? 0), 0);
  const priced = renter !== null && purpose !== null;

  const change = (patch: Partial<BookingDraft>) => onDraftChange({ ...draft, ...patch });

  function changeDates(dates: IsoDate[]) {
    const byDate = new Map(slots.map((slot) => [slot.date, slot]));
    change({ slots: dates.map((date) => byDate.get(date) ?? { date, start: "", end: "", isCrossMidnight: false }) });
  }

  return (
    <div className="divide-y divide-divider px-8 py-5">
      <div className="pb-2">
        <Row field="renter" label="租借人" revealed={revealed}>
          <PersonPicker
            people={data.roster}
            selectedLabel={renterLabel(renter)}
            placeholder="選擇租借人"
            create={{ kind: "open", label: (name) => `新增「${name}」為外部客戶` }}
            onChange={(pick) => {
              const next: RenterSelection =
                pick.kind === "existing"
                  ? { type: "roster", id: pick.person.id, name: pick.person.name, role: pick.person.role }
                  : { type: "customer", name: pick.name };
              change({ renter: next, purpose: purpose ?? defaultPurposeFor(next.type === "roster" ? next.role : "customer") });
            }}
          />
        </Row>
        <Row field="room" label="教室" revealed={revealed}>
          <RoomPicker room={room} onChange={(next) => change({ room: next })} />
        </Row>
        <Row field="dates" label="日期" revealed={revealed}>
          <MultiDatePicker
            dates={slots.map((slot) => slot.date)}
            onChange={changeDates}
            isDateDisabled={(date) => isDateDisabled(date, today, ctx)}
          />
        </Row>
        <Row field="times" label="每天的時間" revealed={revealed}>
          <div className="space-y-2">
            {slotViews.map(({ slot, error, quote }) => (
              <SlotCard
                key={slot.date}
                slot={slot}
                room={room}
                ruleCtx={ctx}
                blockedBy={null}
                error={error}
                quote={quote}
                onChange={(next) => change({ slots: slots.map((s) => (s.date === slot.date ? next : s)) })}
                onRemove={() => change({ slots: slots.filter((s) => s.date !== slot.date) })}
              />
            ))}
          </div>
        </Row>
      </div>
      <div className="py-2">
        <Row field="purpose" label="用途" revealed={revealed}>
          {purposeChoices ? (
            <PurposePicker purpose={purpose} onChange={(next) => change({ purpose: next })} options={purposeChoices} />
          ) : (
            <p className="pt-1.5 text-sm">{purpose && purposeToLabel(purpose)}</p>
          )}
        </Row>
        {!isFree && (
          <Row field="payment" label="付款方式" revealed={revealed}>
            <PaymentPicker
              payment={draft.payment ?? "transfer"}
              onChange={(payment) => change({ payment })}
              mode={priced ? "choose" : "pending"}
            />
          </Row>
        )}
        <Row field="note" label="備註" revealed={revealed}>
          <Textarea rows={2} value={draft.note ?? ""} onChange={(e) => change({ note: e.target.value || undefined })} />
        </Row>
      </div>
      <div className="pt-2">
        <Row field="total" label="合計" revealed={revealed}>
          <p className="pt-0.5 text-sm">
            {slots.length} 筆
            {priced && <span className="ml-2 text-xl font-semibold" data-testid="booking-total">{isFree ? "免費" : money(totalAmount)}</span>}
          </p>
        </Row>
      </div>
    </div>
  );
}
