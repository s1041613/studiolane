"use client";

import { useState } from "react";
import { EllipsisIcon } from "lucide-react";
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
import { money, roomLabel, slotText } from "@/server/logic/home-selectors";
import type { RentalSummary } from "@/server/types/home";
import { ActionButton, ActionGroup } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NoticeDialog } from "@/components/ui/notice-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ActionFailure, type ShownFailure } from "@/components/shared/failures/action-failure";

interface BookingActionsProps {
  rental: RentalSummary;
}

type EndAction = "postpone" | "cancel";
type Notice = { title: string; failure: ShownFailure };

const PRIMARY_LABEL: Partial<Record<BookingAction, string>> = {
  confirm: "確認",
  markPaid: "標記已付款",
  markDone: "標記完成",
};

const END_LABEL: Record<EndAction, string> = { postpone: "延期", cancel: "取消" };

// E-55 T-按鈕: shows exactly what allowedActions(rental) permits — the same
// rule the server re-checks on every call. confirm/markPaid/markDone run
// straight off the primary button; postpone/cancel always confirm first.
// Every refusal — a plain message, or confirm's overlapping-rivals
// blockers — surfaces through the same NoticeDialog + ActionFailure pair:
// there is exactly one way this component says "no."
export function BookingActions({ rental }: BookingActionsProps) {
  const [endDialog, setEndDialog] = useState<EndAction | null>(null);
  const [endError, setEndError] = useState<ShownFailure | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const actions = allowedActions(rental);
  const primary = actions.find((a) => PRIMARY_LABEL[a]);
  const endActions = actions.filter((a): a is EndAction => a === "postpone" || a === "cancel");

  if (actions.length === 0) return null;

  async function runPrimary(action: BookingAction) {
    const call =
      action === "confirm"
        ? confirmBooking(rental.id)
        : action === "markPaid"
          ? markBookingPaid(rental.id)
          : markBookingDone(rental.id);
    const result = await settle(call);
    if (!result.ok) setNotice({ title: `不能${PRIMARY_LABEL[action]}`, failure: result.error });
  }

  function openEndDialog(action: EndAction) {
    setMenuOpen(false);
    setEndError(null);
    setEndDialog(action);
  }

  function changeEndDialogOpen(open: boolean) {
    if (!open) {
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
    <ActionGroup>
      <div className="flex items-center justify-end gap-1.5">
        {primary && (
          <ActionButton variant="secondary" size="sm" onClick={() => runPrimary(primary)}>
            {PRIMARY_LABEL[primary]}
          </ActionButton>
        )}
        {endActions.length > 0 && (
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger render={<Button variant="secondary" size="icon" aria-label="更多操作" />}>
              <EllipsisIcon />
            </PopoverTrigger>
            <PopoverContent align="end" surface="menu" className="w-28">
              {endActions.map((action) => (
                <Button
                  key={action}
                  variant="ghost"
                  className={`justify-start ${action === "cancel" ? "text-destructive" : ""}`}
                  onClick={() => openEndDialog(action)}
                >
                  {END_LABEL[action]}
                </Button>
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>

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
        onOpenChange={(open) => !open && setNotice(null)}
        title={notice?.title ?? ""}
        description={notice?.failure.message}
      >
        {notice && <ActionFailure variant="notice" failure={notice.failure} />}
      </NoticeDialog>
    </ActionGroup>
  );
}
