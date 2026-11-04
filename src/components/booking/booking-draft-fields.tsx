"use client";

import type { ReactNode } from "react";
import { PersonPicker } from "@/components/shared/people/person-picker";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { checkBooking } from "@/server/logic/booking-rules";
import { defaultPurposeFor, purposeOptions } from "@/server/logic/purpose-rules";
import type { PurposeSetting } from "@/server/logic/purpose-rules";
import { hourlyRate, quoteSlot } from "@/server/logic/pricing";
import type { PricingPlan, RosterEntry } from "@/server/logic/pricing";
import type { RentalRule } from "@/server/logic/booking-rules";
import type { BookingDraft, PaymentChoice, Purpose, RenterSelection, SlotDraft } from "@/server/logic/booking";
import { DRAFT_FIELDS, type DraftField } from "@/server/logic/kobeyee";
import { shortDateParts } from "@/server/logic/date";
import { money } from "@/server/logic/home-selectors";
import { paymentMethodToLabel, purposeToLabel, roleToLabel } from "@/server/supabase/codecs";
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

const ROOMS = [
  { value: "A", label: "大教室" },
  { value: "B", label: "小教室" },
] as const;
const PAYMENTS: PaymentChoice[] = ["transfer", "on_site"];
const SKELETON_TONE = "bg-foreground/[.07]";

function Row({ field, label, revealed, skeleton, children }: {
  field: DraftField;
  label: string;
  revealed: number;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  const shown = DRAFT_FIELDS.indexOf(field) < revealed;
  return (
    <div data-field={field} className="grid grid-cols-[84px_1fr] items-baseline gap-x-3 py-[7px]">
      <span className="pt-1 text-[13px] text-muted-foreground">{label}</span>
      {shown ? <div className="min-w-0 animate-in fade-in-0 duration-300">{children}</div> : <div aria-hidden="true">{skeleton}</div>}
    </div>
  );
}

function Bar({ className }: { className: string }) {
  return <Skeleton className={`${SKELETON_TONE} ${className}`} />;
}

function Divider() {
  return <div className="my-2.5 h-px bg-(--eb-desk-hair)" />;
}

// Times come from the read message, so they show as text, not inputs.
function SlotRow({ slot, error, amount }: { slot: SlotDraft; error: string | null; amount: number | null }) {
  const { monthDay, weekday } = shortDateParts(slot.date);
  return (
    // Fixed columns so dates, weekdays and times line up whatever their width.
    <div
      data-slot-row
      className={`grid h-[35px] grid-cols-[3rem_4.5rem_2.75rem_1rem_2.75rem_1fr_auto] items-center text-sm tabular-nums ${error ? "font-semibold" : ""}`}
    >
      <span>{monthDay}</span>
      <small className="text-[13px] text-muted-foreground">{weekday}</small>
      <span className="text-right">{slot.start}</span>
      <span className="text-center">–</span>
      <span>{slot.end}</span>
      <span className="ml-2.5 text-[11.5px] font-bold text-warn">{error}</span>
      <span className="text-right text-text-secondary">{amount !== null && money(amount)}</span>
    </div>
  );
}

function renterLabel(renter: RenterSelection | null): string {
  if (!renter) return "";
  return renter.type === "roster" ? renter.name : `${renter.name}（外部客戶）`;
}

// A controlled BookingDraft editor laid out as label/value rows. Prices and
// the payment row wait for a renter, since the rate depends on who rents.
export function BookingDraftFields({ draft, onDraftChange, revealed, data }: BookingDraftFieldsProps) {
  const { renter, room, slots, purpose } = draft;
  const ctx = data;
  const role = renter ? (renter.type === "roster" ? renter.role : "customer") : null;
  const purposeChoices = role ? purposeOptions(data.purposeSettings, role) : null;
  const rate = renter && purpose ? hourlyRate({ renter, purpose, room }, ctx) : null;
  const isFree = rate?.ok === true && rate.rate === 0;
  const priced = renter !== null && purpose !== null;

  const slotViews = slots.map((slot) => {
    const check = slot.start && slot.end ? checkBooking(slot, room, ctx) : null;
    const quote = check?.ok && renter && purpose ? quoteSlot({ renter, purpose, room, slot }, ctx) : null;
    return { slot, error: check && !check.ok ? check.reason : null, amount: quote?.ok ? quote.amount : null };
  });
  const totalAmount = slotViews.reduce((sum, v) => sum + (v.amount ?? 0), 0);

  const change = (patch: Partial<BookingDraft>) => onDraftChange({ ...draft, ...patch });

  return (
    <div className="px-[34px] pt-[22px] pb-6">
      <Row field="renter" label="租借人" revealed={revealed} skeleton={<Bar className="h-7 w-40" />}>
        <div className={`flex items-baseline [&>button]:-ml-2 [&>button]:h-auto [&>button]:w-auto [&>button]:max-w-[340px] [&>button]:py-0.5 ${renter ? "[&>button]:text-xl [&>button]:font-semibold" : "[&>button]:text-[15px]"}`}>
          <PersonPicker
            variant="inline"
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
          {renter?.type === "roster" && <span className="ml-2.5 text-[13px] text-muted-foreground">{roleToLabel(renter.role)}</span>}
        </div>
      </Row>
      <Row field="room" label="教室" revealed={revealed} skeleton={<Bar className="h-[26px] w-32" />}>
        <SegmentedControl look="gel" aria-label="教室" options={ROOMS} value={room} onValueChange={(next) => change({ room: next })} />
      </Row>
      <Row field="dates" label="日期" revealed={revealed} skeleton={<Bar className="h-3.5 w-72" />}>
        <p className="pt-1 text-[15px] font-medium">{slots.map((slot) => shortDateParts(slot.date).monthDay).join("、")}</p>
      </Row>
      <Row
        field="times"
        label="每天的時間"
        revealed={revealed}
        skeleton={
          <div className="space-y-5 pt-1">
            {slots.map((slot) => (
              <div key={slot.date} className="flex justify-between">
                <Bar className="h-3.5 w-48" />
                <Bar className="h-3.5 w-11" />
              </div>
            ))}
          </div>
        }
      >
        <div className="-mt-1 flex flex-col gap-0.5">
          {slotViews.map(({ slot, error, amount }) => (
            <SlotRow
              key={slot.date}
              slot={slot}
              error={error}
              amount={amount}
            />
          ))}
        </div>
      </Row>
      <Divider />
      <Row field="purpose" label="用途" revealed={revealed} skeleton={<Bar className="h-7 w-44" />}>
        {purposeChoices ? (
          <SegmentedControl
            look="gel"
            aria-label="用途"
            options={purposeChoices.map(({ purpose: p, availability }) => ({ value: p, label: purposeToLabel(p), disabled: !availability.ok }))}
            value={purpose ?? ("" as Purpose)}
            onValueChange={(next) => change({ purpose: next })}
          />
        ) : (
          <p className="pt-1 text-sm">{purpose && purposeToLabel(purpose)}</p>
        )}
      </Row>
      {!isFree && (
        <Row field="payment" label="付款方式" revealed={revealed} skeleton={<Bar className="h-7 w-36" />}>
          <SegmentedControl
            look="gel"
            aria-label="付款方式"
            options={PAYMENTS.map((p) => ({ value: p, label: paymentMethodToLabel(p) }))}
            value={draft.payment ?? "transfer"}
            onValueChange={(payment) => change({ payment })}
          />
        </Row>
      )}
      <Row field="note" label="備註" revealed={revealed} skeleton={<Bar className="h-3.5 w-60" />}>
        <Textarea
          rows={1}
          aria-label="備註"
          value={draft.note ?? ""}
          onChange={(e) => change({ note: e.target.value || undefined })}
          className="-ml-2 min-h-0 resize-none border-transparent bg-transparent px-2 py-1 text-[14.5px] hover:border-transparent hover:bg-foreground/5 focus-visible:border-(--eb-desk-accent-edge) focus-visible:bg-(--eb-desk-field)"
        />
      </Row>
      <Divider />
      <Row field="total" label="合計" revealed={revealed} skeleton={<Bar className="h-7 w-32" />}>
        <p className="pt-1.5 text-[22px] font-semibold tracking-tight">
          <small className="mr-1.5 text-[13px] font-medium text-text-secondary">{slots.length} 筆</small>
          {priced && <span data-testid="booking-total">{isFree ? "免費" : money(totalAmount)}</span>}
        </p>
      </Row>
    </div>
  );
}
