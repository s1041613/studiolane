"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { settle } from "@/lib/settle";
import {
  cancelBooking,
  confirmBooking,
  markBookingDone,
  markBookingPaid,
  postponeBooking,
} from "@/server/actions/bookings";
import { allowedActions, needsRefund } from "@/server/logic/bookings";
import type { BookingAction } from "@/server/logic/bookings";
import { conflictInfo, money, roomLabel, slotText } from "@/server/logic/home-selectors";
import { rivalText } from "@/server/logic/shelf";
import { statusToLabel } from "@/server/supabase/codecs";
import type { RentalStatusCode } from "@/server/supabase/codecs";
import type { RentalSummary } from "@/server/types/home";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { NoticeDialog } from "@/components/ui/notice-dialog";
import { ActionFailure, type ShownFailure } from "@/components/shared/failures/action-failure";

interface BookingActionsProps {
  rental: RentalSummary;
  // For conflictInfo/rivalText: a clash depends on every other rental, not
  // just this row.
  allRentals: RentalSummary[];
  // Controlled by the row: a click on the trigger or a right-click
  // anywhere on the row opens the same menu, so the open state lives one
  // level up (bookings-shelf.tsx), not here.
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type EndAction = "postpone" | "cancel";
type PrimaryAction = "confirm" | "markPaid" | "markDone";
type Notice = { title: string; failure: ShownFailure };

const PRIMARY_LABEL: Record<PrimaryAction, string> = {
  confirm: "確認",
  markPaid: "標記已付款",
  markDone: "標記完成",
};

// Each server action declares its own Reactions (confirmBooking alone adds
// blockers), so the menu normalizes every call to the same shape here
// rather than exposing that mismatch to runPrimary.
const PRIMARY_ACTION: Record<PrimaryAction, (id: string) => Promise<ShownFailure | null>> = {
  confirm: async (id) => {
    const result = await settle(confirmBooking(id));
    return result.ok ? null : result.error;
  },
  markPaid: async (id) => {
    const result = await settle(markBookingPaid(id));
    return result.ok ? null : result.error;
  },
  markDone: async (id) => {
    const result = await settle(markBookingDone(id));
    return result.ok ? null : result.error;
  },
};

// The menu's own item text keeps the "…" (these always ask something
// else first — the confirm dialog below); the dialog's own title, confirm
// button, and refund note read the plain verb instead.
const END_MENU_LABEL: Record<EndAction, string> = { postpone: "延期…", cancel: "取消…" };
const END_LABEL: Record<EndAction, string> = { postpone: "延期", cancel: "取消" };

function isPrimaryAction(action: BookingAction): action is PrimaryAction {
  return action in PRIMARY_ACTION;
}

// The 狀態 cell: plain text at rest (bookings-shelf.tsx's row owns the
// hover/selected styling that turns this into blue text with a ⌄). Opening
// it — by click or by the row's right-click — lists exactly what
// allowedActions(rental) permits, the same rule the server re-checks on
// every call. A clashing row's 確認 item is disabled and reads the rival
// instead of "確認", so staff see who to deal with first without opening
// the row's info panel. Every refusal — a plain message, or confirm's
// overlapping-rivals blockers — surfaces through the same NoticeDialog +
// ActionFailure pair: there is exactly one way this component says "no."
export function BookingActions({ rental, allRentals, open, onOpenChange }: BookingActionsProps) {
  const [endDialog, setEndDialog] = useState<EndAction | null>(null);
  const [endError, setEndError] = useState<ShownFailure | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const actions = allowedActions(rental);
  const label = statusToLabel(rental.status as RentalStatusCode);

  if (actions.length === 0) {
    return <span>{label}</span>;
  }

  const clashing = conflictInfo(rental, allRentals) != null;

  async function runPrimary(action: PrimaryAction) {
    onOpenChange(false);
    const failure = await PRIMARY_ACTION[action](rental.id);
    if (failure) setNotice({ title: `不能${PRIMARY_LABEL[action]}`, failure });
  }

  function openEndDialog(action: EndAction) {
    onOpenChange(false);
    setEndError(null);
    setEndDialog(action);
  }

  function changeEndDialogOpen(nextOpen: boolean) {
    if (!nextOpen) {
      setEndDialog(null);
      setEndError(null);
    }
  }

  async function runEnd(action: EndAction) {
    setEndError(null);
    const result = await settle(action === "postpone" ? postponeBooking(rental.id) : cancelBooking(rental.id));
    if (result.ok) setEndDialog(null);
    // Dialog stays open, same context, so retrying doesn't lose the refund warning.
    else setEndError(result.error);
  }

  return (
    <>
      <Menu open={open} onOpenChange={onOpenChange}>
        <MenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              aria-label={`狀態 ${label}`}
              // Plain text at rest, same as every other cell; the row's own
              // "group" turns this blue on hover/selection (bookings-shelf.tsx).
              className="-mx-1.5 h-auto gap-1 rounded-md border-none bg-transparent px-1.5 py-0.5 text-foreground hover:bg-transparent hover:text-link aria-expanded:bg-transparent group-hover:text-link group-aria-[selected=true]:text-link focus-visible:text-link data-popup-open:text-link"
            />
          }
        >
          {label}
          <ChevronDownIcon
            aria-hidden
            className="size-3 opacity-0 transition-opacity group-hover:opacity-100 group-aria-[selected=true]:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
          />
        </MenuTrigger>
        <MenuContent>
          {actions.map((action) => {
            if (isPrimaryAction(action)) {
              const disabled = action === "confirm" && clashing;
              return (
                <MenuItem key={action} disabled={disabled} onClick={() => runPrimary(action)}>
                  {disabled ? rivalText(rental, allRentals) : PRIMARY_LABEL[action]}
                </MenuItem>
              );
            }
            return (
              <MenuItem
                key={action}
                className={action === "cancel" ? "text-destructive" : undefined}
                onClick={() => openEndDialog(action)}
              >
                {END_MENU_LABEL[action]}
              </MenuItem>
            );
          })}
        </MenuContent>
      </Menu>

      <ConfirmDialog
        open={endDialog !== null}
        onOpenChange={changeEndDialogOpen}
        title={endDialog ? `${END_LABEL[endDialog]}這筆預約？` : ""}
        confirmLabel={endDialog ? `確定${END_LABEL[endDialog]}` : ""}
        destructive={endDialog === "cancel"}
        onConfirm={() => (endDialog ? runEnd(endDialog) : Promise.resolve())}
        description={
          <>
            {rental.person} · {slotText(rental)} · {roomLabel(rental)}
            {endDialog && needsRefund(rental) && (
              <span className="mt-2 block rounded-lg bg-inset p-2 text-warn">
                這筆已付款 {money(rental.amount ?? 0)}，{END_LABEL[endDialog]}後需要退款。備註會加上「【需要退款】」。
              </span>
            )}
            {endError && <ActionFailure variant="inline" failure={endError} />}
          </>
        }
      />

      <NoticeDialog
        open={notice !== null}
        onOpenChange={(nextOpen) => !nextOpen && setNotice(null)}
        title={notice?.title ?? ""}
        description={notice?.failure.message}
      >
        {notice && <ActionFailure variant="notice" failure={notice.failure} />}
      </NoticeDialog>
    </>
  );
}
