"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { createRentalRules, previewRuleOverlaps, updateRentalRule } from "@/server/actions/rental-rules";
import type { Failure } from "@/lib/result";
import { settle } from "@/lib/settle";
import type { RuleBlockers } from "@/server/services/rule-writes";
import {
  EMPTY_RULE_DRAFT,
  REASON_MAX,
  WEEKDAY_SHORTCUTS,
  draftFromRule,
  hasRuleErrors,
  ruleFormReducer,
  validateRuleDraft,
} from "@/server/logic/rental-rule-form";
import type { DayMode, Room, RuleDraft, RuleFieldErrors } from "@/server/logic/rental-rule-form";
import { ruleDayLabel, weekdayLabel } from "@/server/logic/rental-rules";
import type { RentalRule, RuleEffect } from "@/server/logic/booking-rules";
import { brokenRentalsMessage } from "@/server/logic/rule-impact";
import type { RentalSummary } from "@/server/types/home";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldList, overLengthMessage } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DiscardChangesDialog, useDiscardGuard } from "@/components/ui/confirm-dialog";
import { MultiSegmentedControl, SegmentedControl } from "@/components/ui/segmented-control";
import { AffectedRentals } from "@/components/shared/rentals/affected-rentals";
import { ActionFailure } from "@/components/shared/failures/action-failure";
import { TimeRangePicker } from "@/components/shared/schedule/time-range-picker";

export type RuleDialogMode = "create" | { edit: RentalRule };

const ROOM_OPTIONS = [
  { value: "A", label: "A" },
  { value: "B", label: "B" },
] as const;
const MODE_OPTIONS = [
  { value: "weekly", label: "每週" },
  { value: "date", label: "指定日期" },
] as const;
const EFFECT_OPTIONS = [
  { value: "block", label: "不可租" },
  { value: "open", label: "可租" },
] as const;
const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: String(d), label: weekdayLabel(d).slice(1) }));

// The fields that decide which bookings a block covers; the reason doesn't.
function overlapKey(d: RuleDraft): string {
  return JSON.stringify([d.rooms, d.mode, d.weekdays, d.onDate, d.effect, d.start, d.end]);
}

// A choice (segmented buttons) is a labelled group that points at its error;
// text inputs get `${id}-error` on aria-describedby themselves.
function ChoiceField({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Field label={label} labelId={`${id}-label`} required hint={hint} error={error} describedById={`${id}-error`}>
      <FieldGroup aria-labelledby={`${id}-label`}>{children}</FieldGroup>
    </Field>
  );
}

const describedBy = (id: string, error?: string) => (error ? `${id}-error` : undefined);

export function RentalRuleDialog({
  mode,
  today,
  onClose,
  onSaved,
}: {
  mode: RuleDialogMode;
  today: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const editing = mode !== "create";
  const editingId = editing ? mode.edit.id : undefined;
  const initial = editing ? draftFromRule(mode.edit) : EMPTY_RULE_DRAFT;
  const [draft, dispatch] = useReducer(ruleFormReducer, initial);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<RuleFieldErrors>({});
  const [failure, setFailure] = useState<Failure<{ blockers: RuleBlockers }> | null>(null);
  const [pending, setPending] = useState(false);
  const [overlaps, setOverlaps] = useState<RentalSummary[]>([]);
  const [previewFailed, setPreviewFailed] = useState(false);
  const latestPreview = useRef(0);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const guard = useDiscardGuard(isDirty, onClose);

  const purpose = editing ? "edit" : "create";
  const errors: RuleFieldErrors = submitted ? { ...validateRuleDraft(draft, today, purpose), ...serverErrors } : {};
  const reasonError = errors.reason ?? overLengthMessage(draft.reason, REASON_MAX);

  // Ask the server again whenever room, day or time changes; only the
  // latest answer counts. Bookings the change would break are listed and
  // 儲存 stays off until they are dealt with.
  const key = overlapKey(draft);
  useEffect(() => {
    const [rooms, dayMode, weekdays, onDate, effect, start, end] = JSON.parse(key);
    const ticket = ++latestPreview.current;
    const timer = setTimeout(async () => {
      const preview = { ...EMPTY_RULE_DRAFT, rooms, mode: dayMode, weekdays, onDate, effect, start, end };
      const result = await settle(previewRuleOverlaps(preview, editingId));
      if (ticket !== latestPreview.current) return;
      // A failed check doesn't lock 儲存 — saving checks again on the
      // server — but the stale list goes and the user is told why.
      setPreviewFailed(!result.ok);
      setOverlaps(result.ok ? result.data : []);
    }, 300);
    return () => clearTimeout(timer);
  }, [key, editingId]);

  function update(action: Parameters<typeof dispatch>[0]) {
    setServerErrors({});
    setFailure(null);
    dispatch(action);
  }

  async function submit() {
    setSubmitted(true);
    setFailure(null);
    if (hasRuleErrors(validateRuleDraft(draft, today, purpose))) return;
    setPending(true);
    const result = await settle(editing ? updateRentalRule(mode.edit.id, draft) : createRentalRules(draft));
    setPending(false);
    if (result.ok) onSaved(result.data);
    else if (result.error.kind === "fields") setServerErrors(result.error.fields);
    else setFailure(result.error);
  }

  const title = editing ? `編輯：${ruleDayLabel(mode.edit)} ${mode.edit.reason}` : "新增租借規則";
  const blockedByBookings = overlaps.length > 0;

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && !pending && guard.requestClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          {/* contents: the body scrolls and the footer stays put inside the dialog. */}
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <DialogBody>
              <FieldList>
                <ChoiceField id="rule-rooms" label="教室" hint="可複選" error={errors.rooms}>
                  <MultiSegmentedControl<Room>
                    aria-label="教室"
                    options={ROOM_OPTIONS}
                    value={draft.rooms}
                    onValueChange={(rooms) => update({ type: "setRooms", rooms })}
                  />
                </ChoiceField>

                <ChoiceField id="rule-mode" label="時間">
                  <SegmentedControl<DayMode>
                    aria-label="時間"
                    options={MODE_OPTIONS}
                    value={draft.mode}
                    onValueChange={(next) => update({ type: "setMode", mode: next })}
                  />
                </ChoiceField>

                {draft.mode === "weekly" ? (
                  <ChoiceField id="rule-weekdays" label="星期" hint={editing ? undefined : "可複選"} error={errors.weekdays}>
                    {editing ? (
                      <SegmentedControl
                        aria-label="星期"
                        options={WEEKDAY_OPTIONS}
                        value={String(draft.weekdays[0] ?? "")}
                        onValueChange={(d) => update({ type: "setWeekdays", weekdays: [Number(d)] })}
                      />
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <MultiSegmentedControl
                          aria-label="星期"
                          options={WEEKDAY_OPTIONS}
                          value={draft.weekdays.map(String)}
                          onValueChange={(days) => update({ type: "setWeekdays", weekdays: days.map(Number) })}
                        />
                        {WEEKDAY_SHORTCUTS.map((s) => (
                          <Button
                            key={s.label}
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => update({ type: "setWeekdays", weekdays: s.weekdays })}
                          >
                            {s.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </ChoiceField>
                ) : (
                  <>
                    <Field label="日期" htmlFor="rule-date" required error={errors.onDate} describedById="rule-date-error">
                      <div className="w-44">
                        <DateField
                          id="rule-date"
                          placeholder="選擇日期"
                          value={draft.onDate || null}
                          isDateDisabled={(date) => date < today}
                          aria-invalid={errors.onDate ? true : undefined}
                          aria-describedby={describedBy("rule-date", errors.onDate)}
                          onChange={(onDate) => update({ type: "setOnDate", onDate: onDate ?? "" })}
                        />
                      </div>
                    </Field>
                    {/* 租借 only for a one-day rule; weekly rules are always 不可租. */}
                    <ChoiceField id="rule-effect" label="租借">
                      <SegmentedControl<RuleEffect>
                        aria-label="租借"
                        options={EFFECT_OPTIONS}
                        value={draft.effect}
                        onValueChange={(effect) => update({ type: "setEffect", effect })}
                      />
                    </ChoiceField>
                  </>
                )}

                <Field label="開始／結束" htmlFor="rule-time-start" required>
                  <TimeRangePicker
                    id="rule-time"
                    start={draft.start}
                    end={draft.end}
                    error={errors.time}
                    onChange={({ start, end }) => update({ type: "setTime", start, end })}
                  />
                </Field>

                <Field
                  label="原因"
                  htmlFor="rule-reason"
                  required
                  hint="會出現在預約表單的錯誤訊息"
                  error={reasonError}
                  describedById="rule-reason-error"
                >
                  <Input
                    id="rule-reason"
                    placeholder="例：平日白天 13:30 前不開放"
                    aria-invalid={reasonError ? true : undefined}
                    aria-describedby={describedBy("rule-reason", reasonError)}
                    value={draft.reason}
                    onChange={(e) => update({ type: "setReason", reason: e.target.value })}
                  />
                </Field>
              </FieldList>

              {errors.form && (
                <p role="alert" className="mt-4 text-sm text-destructive">
                  {errors.form}
                </p>
              )}

              {blockedByBookings && (
                <div className="mt-4">
                  <AffectedRentals heading={`${brokenRentalsMessage(overlaps.length, "存")}，請先改期或取消`} rentals={overlaps} />
                </div>
              )}

              {previewFailed && !failure && (
                <p role="status" className="mt-4 text-sm text-muted-foreground">
                  暫時無法檢查預約，按儲存時會再檢查一次
                </p>
              )}

              {failure && <ActionFailure className="mt-4" failure={failure} />}
            </DialogBody>

            <DialogFooter>
              <ActionButton type="submit" size="lg" pending={pending} disabled={blockedByBookings}>
                儲存
              </ActionButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog open={guard.confirming} onDiscard={guard.discard} onKeepEditing={guard.keepEditing} />
    </>
  );
}
