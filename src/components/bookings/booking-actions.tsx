"use client";

import { useState } from "react";
import { cn } from "cn";
import { ChevronDownIcon } from "lucide-react";
import { settle } from "@/lib/settle";
import {
  cancelBooking,
  confirmBooking,
  markBookingDone,
  markBookingPaid,
  postponeBooking,
} from "@/server/actions/bookings";
import { allowedActions, conflictDialogRows, needsRefund, rivalSnapshot } from "@/server/logic/bookings";
import type { BookingAction } from "@/server/logic/bookings";
import { money, slotText } from "@/server/logic/home-selectors";
import { shortDateParts } from "@/server/logic/date";
import { roomToLabel, statusToLabel } from "@/server/supabase/codecs";
import type { RentalStatusCode } from "@/server/supabase/codecs";
import type { RentalSummary } from "@/server/types/home";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { NoticeDialog } from "@/components/ui/notice-dialog";
import { ActionFailure, type ShownFailure } from "@/components/shared/failures/action-failure";

interface BookingActionsProps {
  rental: RentalSummary;
  // Controlled by the row: a click on the trigger or a right-click
  // anywhere on the row opens the same menu, so the open state lives one
  // level up (bookings-shelf.tsx), not here.
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Bold label: the row still needs a decision.
  emphasized?: boolean;
}

type EndAction = "postpone" | "cancel";
type PrimaryAction = "confirm" | "markPaid" | "markDone";
type Notice = { title: string; failure: ShownFailure };

const PRIMARY_LABEL: Record<PrimaryAction, string> = {
  confirm: "確認",
  markPaid: "標記已付款",
  markDone: "標記完成",
};

function isPrimaryAction(action: BookingAction): action is PrimaryAction {
  return action in PRIMARY_LABEL;
}

// markPaid/markDone each write just that one change, so both read as a
// plain ShownFailure | null; confirm's own blockers drive the clash dialog
// below instead, so it has its own dispatch (runConfirm) rather than living
// in this map.
const PRIMARY_ACTION: Record<"markPaid" | "markDone", (id: string) => Promise<ShownFailure | null>> = {
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

// The 狀態 cell: plain text at rest (bookings-shelf.tsx's row owns the
// hover/selected styling that turns this into blue text with a ⌄). Opening
// it — by click or by the row's right-click — lists exactly what
// allowedActions(rental) permits, the same rule the server re-checks on
// every call. Every refusal — a plain message, confirm's own clash list, or
// the end actions' refund warning — surfaces through ConfirmDialog or
// NoticeDialog plus the same ActionFailure, so there is exactly one way
// this component says "no."
export function BookingActions({ rental, open, onOpenChange, emphasized = false }: BookingActionsProps) {
  const [endDialog, setEndDialog] = useState<EndAction | null>(null);
  const [endError, setEndError] = useState<ShownFailure | null>(null);
  const [clashRivals, setClashRivals] = useState<RentalSummary[] | null>(null);
  const [clashError, setClashError] = useState<ShownFailure | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const actions = allowedActions(rental);
  const label = statusToLabel(rental.status as RentalStatusCode);

  if (actions.length === 0) {
    return <span className="text-muted-foreground">{label}</span>;
  }

  // 確認 with no rivals goes straight through; with rivals, the server
  // reports them as blockers instead of writing anything, and this opens
  // the clash dialog below to ask whether to cancel them.
  async function runConfirm() {
    const result = await settle(confirmBooking(rental.id));
    if (result.ok) return;
    if (result.error.kind === "blockers") {
      setClashError(null);
      setClashRivals(result.error.blockers.conflicts);
      return;
    }
    setNotice({ title: "不能確認", failure: result.error });
  }

  async function runPrimary(action: PrimaryAction) {
    onOpenChange(false);
    if (action === "confirm") {
      await runConfirm();
      return;
    }
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

  function changeClashDialogOpen(nextOpen: boolean) {
    if (!nextOpen) {
      setClashRivals(null);
      setClashError(null);
    }
  }

  // The user already saw and accepted this exact rival list; sending it
  // back is what tells the server to cancel them alongside confirming.
  // A stale mismatch (someone else acted on the room meanwhile) comes back
  // as a plain refusal, shown inline same as the end dialog's.
  async function runClashConfirm() {
    if (!clashRivals) return;
    setClashError(null);
    const result = await settle(confirmBooking(rental.id, clashRivals.map(rivalSnapshot)));
    if (result.ok) setClashRivals(null);
    else setClashError(result.error);
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
              className={cn(
                "-mx-1.5 h-5 gap-1.5 rounded-[5px] border-none bg-transparent px-1.5 py-0 text-[13px] text-foreground hover:bg-transparent hover:text-link aria-expanded:bg-transparent group-hover:text-link group-aria-[selected=true]:text-link focus-visible:text-link data-popup-open:text-link",
                emphasized ? "font-semibold" : "font-normal",
              )}
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
              return (
                <MenuItem key={action} onClick={() => runPrimary(action)}>
                  {PRIMARY_LABEL[action]}
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
            {rental.person} · {slotText(rental)} · {roomToLabel(rental.room)}
            {endDialog && needsRefund(rental) && (
              <span className="mt-2 block rounded-lg bg-inset p-2 text-warn">
                這筆已付款 {money(rental.amount ?? 0)}，{END_LABEL[endDialog]}後需要退款。備註會加上「【需要退款】」。
              </span>
            )}
            {endError && <ActionFailure variant="inline" failure={endError} />}
          </>
        }
      />

      <ConfirmDialog
        open={clashRivals !== null}
        onOpenChange={changeClashDialogOpen}
        title="確認並取消重疊的預約？"
        cancelLabel="返回"
        confirmLabel="確認並取消其他"
        destructive
        onConfirm={runClashConfirm}
        description={
          clashRivals && (
            <ClashRivalList rental={rental} rivals={clashRivals} error={clashError} />
          )
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

// This booking and its rivals, oldest submission first, with the one being
// kept marked — conflictDialogRows is the same ordering the server used to
// decide which rivals to list.
function ClashRivalList({
  rental,
  rivals,
  error,
}: {
  rental: RentalSummary;
  rivals: RentalSummary[];
  error: ShownFailure | null;
}) {
  // ConfirmDialog renders this inside AlertDialogDescription, which base-ui
  // renders as a <p> — a <ul>/<li>/<div> here would be invalid HTML nested
  // in a <p> (and a hydration error), so every row stays a <span> styled
  // as a block, same as the refund warning below and ActionFailure's
  // "inline" variant.
  return (
    <span className="block space-y-1.5">
      {conflictDialogRows(rental, rivals).map(({ rental: row, keep }) => (
        <span key={row.id} className="block">
          {shortDateParts(row.date).monthDay} {row.start}–{row.end} {row.person}
          <span className={keep ? "ml-1.5 text-muted-foreground" : "ml-1.5 text-destructive"}>
            {keep ? "保留" : "取消"}
          </span>
          {!keep && needsRefund(row) && (
            <span className="mt-1 block rounded-lg bg-inset p-2 text-warn">
              這筆已付款 {money(row.amount ?? 0)}，取消後需要退款。備註會加上「【需要退款】」。
            </span>
          )}
        </span>
      ))}
      {error && <ActionFailure variant="inline" failure={error} />}
    </span>
  );
}
