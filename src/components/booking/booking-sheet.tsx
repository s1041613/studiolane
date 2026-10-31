"use client";

import { useMemo, useState } from "react";
import { RoomPicker } from "@/components/booking/room-picker";
import { MultiDatePicker } from "@/components/booking/multi-date-picker";
import { SlotCard } from "@/components/booking/slot-card";
import { PurposePicker } from "@/components/booking/purpose-picker";
import { PaymentPicker } from "@/components/booking/payment-picker";
import { PersonPicker } from "@/components/shared/people/person-picker";
import { StickyBottomBar } from "@/components/booking/sticky-bottom-bar";
import { ConflictConfirmDialog } from "@/components/booking/conflict-confirm-dialog";
import { Card } from "@/components/ui/card";
import { Field, focusFirstError } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { NoticeDialog } from "@/components/ui/notice-dialog";
import { ActionFailure, type ShownFailure } from "@/components/shared/failures/action-failure";
import { SectionFailure } from "@/components/shared/failures/section-failure";
import type { Failure } from "@/lib/result";
import { settle } from "@/lib/settle";
import { submitBooking } from "@/server/actions/submit-booking";
import { checkBooking, isDateDisabled, isValidHHmm } from "@/server/logic/booking-rules";
import { orderedErrorFields, validateBookingDraft } from "@/server/logic/booking-validation";
import type { BookingFieldErrors } from "@/server/logic/booking-validation";
import type { BookingConflict } from "@/server/logic/booking-conflicts";
import { defaultPurposeFor, purposeAvailability, purposeOptions } from "@/server/logic/purpose-rules";
import type { PurposeOption, PurposeSetting } from "@/server/logic/purpose-rules";
import { hourlyRate, quoteSlot } from "@/server/logic/pricing";
import type { RosterEntry, PricingPlan } from "@/server/logic/pricing";
import type { RentalRule } from "@/server/logic/booking-rules";
import type { BookingDraft, IsoDate, PaymentChoice, Purpose, RenterSelection, SlotDraft } from "@/server/logic/booking";
import { todayIso } from "@/server/logic/date";
import { toStartsEndsAt } from "@/server/supabase/codecs";
import { purposeToLabel } from "@/server/supabase/codecs";
import type { RentalSummary } from "@/server/types/home";

interface BookingSheetProps {
  initialRules: RentalRule[];
  initialRoster: RosterEntry[];
  initialPlans: PricingPlan[];
  initialRentals: RentalSummary[];
  initialPurposeSettings: PurposeSetting[];
  // Why some of the data above could not be read: the form card turns red
  // and says so at the top, but stays usable.
  readFailure?: Failure | null;
}

function emptySlot(date: IsoDate): SlotDraft {
  return { date, start: "", end: "", isCrossMidnight: false };
}

function isSlotFilled(slot: SlotDraft): boolean {
  return isValidHHmm(slot.start) && isValidHHmm(slot.end);
}

const DEFAULT_ROOM = "B"; // F-教室-2
const DEFAULT_PURPOSE: Purpose = "dance"; // F-用途-8 default before any renter
const DEFAULT_PAYMENT: PaymentChoice = "transfer"; // F-付款-1

export function BookingSheet({
  initialRules,
  initialRoster,
  initialPlans,
  initialRentals,
  initialPurposeSettings,
  readFailure,
}: BookingSheetProps) {
  const [renter, setRenter] = useState<RenterSelection | null>(null);
  const [room, setRoom] = useState<"A" | "B">(DEFAULT_ROOM);
  const [dates, setDates] = useState<IsoDate[]>([]);
  const [slots, setSlots] = useState<Record<IsoDate, SlotDraft>>({});
  const [purpose, setPurpose] = useState<Purpose | null>(DEFAULT_PURPOSE);
  const [clearedNote, setClearedNote] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentChoice>(DEFAULT_PAYMENT);
  const [note, setNote] = useState("");
  // Once a submit has failed, errors are recomputed live so each outline
  // disappears as soon as its field is fixed (S-錯誤-4).
  const [showErrors, setShowErrors] = useState(false);
  // Errors only the server could see (fresher data, S-錯誤-5), tied to the
  // exact draft they were reported for.
  const [serverErrors, setServerErrors] = useState<{ draftKey: string; errors: BookingFieldErrors } | null>(null);
  // A server failure that isn't tied to a field (S-完成-7).
  const [submitError, setSubmitError] = useState<ShownFailure | null>(null);
  // E-41 情境2/3/5: someone else's held, overlapping booking(s) — null while
  // the dialog is closed, the list to show while it's open.
  const [conflicts, setConflicts] = useState<BookingConflict[] | null>(null);
  // How many rentals the last successful submit wrote; null while the
  // success notice is closed.
  const [successCount, setSuccessCount] = useState<number | null>(null);

  const ctx = useMemo(
    () => ({
      rules: initialRules,
      existingRentals: initialRentals,
      roster: initialRoster,
      plans: initialPlans,
      purposeSettings: initialPurposeSettings,
    }),
    [initialRules, initialRentals, initialRoster, initialPlans, initialPurposeSettings],
  );
  const today = todayIso();

  const orderedSlots = dates.map((d) => slots[d]).filter((s): s is SlotDraft => s != null);
  const role = renter ? (renter.type === "roster" ? renter.role : "customer") : null;

  // F-用途-1..4: judged only once there's a renter and every slot has times;
  // what each role may pick comes from purpose_settings (用途 B4).
  const purposeChoices: PurposeOption[] | null =
    role && orderedSlots.length > 0 && orderedSlots.every(isSlotFilled)
      ? purposeOptions(initialPurposeSettings, role)
      : null;

  // F-用途-5: a chosen purpose that another change made unavailable is
  // cleared, with the reason shown. Adjusting state during render (rather
  // than in an effect) keeps the form from flashing the invalid choice.
  const currentAvailability =
    purpose && purposeChoices ? purposeAvailability(purpose, role, initialPurposeSettings) : null;
  if (purpose && currentAvailability && !currentAvailability.ok) {
    setPurpose(null);
    setClearedNote(`已清空「${purposeToLabel(purpose)}」：${currentAvailability.reason}`);
  }

  const chosenPurpose = purposeChoices ? purpose : null;
  // 0 元 (special price or plan) → no payment needed (用途 U10, U12).
  const rate = renter && chosenPurpose ? hourlyRate({ renter, purpose: chosenPurpose, room }, ctx) : null;
  const isFree = rate?.ok === true && rate.rate === 0;

  const draft: BookingDraft = {
    room,
    renter,
    slots: orderedSlots,
    purpose: chosenPurpose,
    payment: isFree ? null : payment,
    note: note || undefined,
  };
  const draftKey = JSON.stringify(draft);

  const liveErrors: BookingFieldErrors = showErrors
    ? (() => {
        const result = validateBookingDraft(draft, ctx);
        return result.ok ? {} : result.fieldErrors;
      })()
    : {};
  const remoteErrors = serverErrors?.draftKey === draftKey ? serverErrors.errors : {};
  // Flattened keys (`slots.0`, `slots.1`, ...) merge per-slot on their own —
  // no nested object to merge by hand.
  const errors: BookingFieldErrors = { ...remoteErrors, ...liveErrors };
  // S-錯誤-2: the count follows the fixes live and the banner goes away at 0.
  const errorCount = orderedErrorFields(errors).length;

  // Per-card status: time problems show as soon as anything is typed
  // (F-時間-6/10), a start already in the past is flagged too (F-時間-9);
  // the price shows once renter and purpose are known (F-時間-7).
  const slotViews = orderedSlots.map((slot, index) => {
    const live = slot.start || slot.end ? checkBooking(slot, room, ctx) : null;
    const isPast =
      live?.ok === true &&
      toStartsEndsAt(slot.date, slot.start, slot.end, slot.isCrossMidnight).startsAt < new Date();
    const liveError = live && !live.ok ? live.reason : isPast ? "這個時段已經過去了" : null;
    const error = errors[`slots.${index}`] ?? liveError;
    const quote =
      !error && live?.ok && !isPast && renter && chosenPurpose
        ? quoteSlot({ renter, purpose: chosenPurpose, room, slot }, ctx)
        : null;
    return { slot, index, error, quote: quote?.ok ? quote : null };
  });
  const totalHours = slotViews.reduce((sum, v) => sum + (v.quote?.hours ?? 0), 0);
  const totalAmount = slotViews.reduce((sum, v) => sum + (v.quote?.amount ?? 0), 0);

  // Rate on the room buttons follows the renter's plan (F-教室-1/4).
  const plan =
    renter?.type === "roster"
      ? initialPlans.find((p) => p.id === initialRoster.find((r) => r.id === renter.id)?.pricingPlanId)
      : renter?.type === "customer"
        ? initialPlans.find((p) => p.category === "customer")
        : undefined;

  function handleDatesChange(nextDates: IsoDate[]) {
    setDates(nextDates);
    setSlots((prev) => Object.fromEntries(nextDates.map((d) => [d, prev[d] ?? emptySlot(d)])));
  }

  function updateSlot(date: IsoDate, slot: SlotDraft) {
    setSlots((prev) => ({ ...prev, [date]: slot }));
  }

  // F-用途-8: every renter change resets the purpose to that role's default.
  function chooseRenter(next: RenterSelection) {
    setRenter(next);
    setPurpose(defaultPurposeFor(next.type === "roster" ? next.role : "customer"));
    setClearedNote(null);
  }

  function choosePurpose(next: Purpose) {
    setPurpose(next);
    setClearedNote(null);
  }

  // S-錯誤-3: bring the first problem into view.
  function focusFirstBookingError(fieldErrors: BookingFieldErrors) {
    const [first] = orderedErrorFields(fieldErrors);
    focusFirstError(first ?? null);
  }

  // Back to a blank form, after the success notice's 確定 (gate G23 default
  // A: this page is kept rather than navigating away).
  function resetForm() {
    setRenter(null);
    setRoom(DEFAULT_ROOM);
    setDates([]);
    setSlots({});
    setPurpose(DEFAULT_PURPOSE);
    setClearedNote(null);
    setPayment(DEFAULT_PAYMENT);
    setNote("");
    setShowErrors(false);
    setServerErrors(null);
    setSubmitError(null);
    setConflicts(null);
    setSuccessCount(null);
  }

  // Shared by the first attempt (acknowledgedIds = []) and 仍要送出
  // (acknowledgedIds = the ids the conflict dialog just showed, 情境3/5/6).
  async function trySubmit(acknowledgedIds: string[]) {
    const result = await settle(submitBooking(draft, acknowledgedIds));
    if (result.ok) {
      setConflicts(null);
      setSuccessCount(result.data.rentalIds.length);
    } else if (result.error.kind === "fields") {
      setServerErrors({ draftKey, errors: result.error.fields });
      focusFirstBookingError(result.error.fields);
    } else if (result.error.kind === "blockers") {
      // 情境2: nothing was written. 情境5: a fresh conflict appeared while
      // the dialog was open — this replaces its list with the new one.
      setConflicts(result.error.blockers.conflicts);
    } else {
      setSubmitError(result.error);
    }
  }

  async function handleSubmit() {
    setShowErrors(true);
    setSubmitError(null);
    const local = validateBookingDraft(draft, ctx);
    if (!local.ok) {
      focusFirstBookingError(local.fieldErrors);
      return;
    }

    await trySubmit([]);
  }

  return (
    <Card padding="roomy">
      {readFailure && (
        <SectionFailure
          placement="top"
          className="mb-6"
          message="部分資料暫時讀不到，可預約時段和金額試算可能不準確"
          failure={readFailure}
        />
      )}
      {showErrors && errorCount > 0 && (
        <div role="alert" className="sticky top-2 z-10 mb-6 rounded-lg bg-surface-solid bg-linear-to-r from-danger-bg to-danger-bg p-3 text-sm text-danger">
          還有 {errorCount} 個地方需要處理
        </div>
      )}
      {submitError && (
        <ActionFailure
          failure={submitError}
          className="sticky top-2 z-10 mb-6 rounded-lg bg-surface-solid bg-linear-to-r from-danger-bg to-danger-bg"
        />
      )}

      <Field data-field="renter" label="租借人" required error={errors.renter} className="scroll-mt-20">
        <PersonPicker
          people={initialRoster}
          selectedLabel={renter ? (renter.type === "roster" ? renter.name : `${renter.name}（外部客戶）`) : ""}
          placeholder="選擇租借人…"
          create={{ kind: "open", label: (name) => `新增「${name}」為外部客戶` }}
          onChange={(pick) =>
            chooseRenter(
              pick.kind === "existing"
                ? { type: "roster", id: pick.person.id, name: pick.person.name, role: pick.person.role }
                : { type: "customer", name: pick.name },
            )
          }
        />
      </Field>

      <Field data-field="room" label="教室" required className="scroll-mt-20">
        <RoomPicker room={room} onChange={setRoom} roomARate={plan?.roomARate} roomBRate={plan?.roomBRate} />
      </Field>

      <Field data-field="dates" label="日期" hint="可以多選" required error={errors.dates} className="scroll-mt-20">
        <MultiDatePicker
          dates={dates}
          onChange={handleDatesChange}
          isDateDisabled={(date) => isDateDisabled(date, today, ctx)}
          invalid={!!errors.dates}
        />
      </Field>

      {slotViews.length > 0 && (
        <Field data-field="slots" label="每天的時間" required className="scroll-mt-20">
          <div className="space-y-2">
            {slotViews.map(({ slot, index, error, quote }) => (
              <div key={slot.date} data-field={`slot-${index}`} className="scroll-mt-20">
                <SlotCard
                  slot={slot}
                  room={room}
                  ruleCtx={ctx}
                  blockedBy={renter ? null : "請先選租借人"}
                  error={error}
                  quote={quote}
                  onChange={(next) => updateSlot(slot.date, next)}
                  onRemove={() => handleDatesChange(dates.filter((d) => d !== slot.date))}
                />
              </div>
            ))}
          </div>
        </Field>
      )}

      <Field data-field="purpose" label="用途" required error={errors.purpose} className="scroll-mt-20">
        <PurposePicker
          purpose={purpose}
          onChange={choosePurpose}
          options={purposeChoices}
          invalid={!!errors.purpose}
        />
        {clearedNote && <p className="text-sm text-warn">{clearedNote}</p>}
      </Field>

      <Field data-field="payment" label="付款方式" required={!isFree} error={errors.payment} className="scroll-mt-20">
        <PaymentPicker
          payment={payment}
          onChange={setPayment}
          invalid={!!errors.payment}
          mode={chosenPurpose === null ? "pending" : isFree ? "free" : "choose"}
        />
      </Field>

      <Field data-field="note" label="備註" className="scroll-mt-20">
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      <StickyBottomBar
        slotCount={orderedSlots.length}
        totalHours={totalHours}
        totalAmount={totalAmount}
        onSubmit={handleSubmit}
      />

      <ConflictConfirmDialog
        open={conflicts !== null}
        conflicts={conflicts ?? []}
        onCancel={() => setConflicts(null)}
        onConfirmAnyway={() => trySubmit((conflicts ?? []).map((c) => c.id))}
      />

      <NoticeDialog
        open={successCount !== null}
        onOpenChange={(open) => !open && resetForm()}
        title="預約已送出"
        description={`共 ${successCount ?? 0} 筆`}
      />
    </Card>
  );
}
