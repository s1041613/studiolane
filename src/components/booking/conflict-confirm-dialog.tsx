"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { BookingConflict } from "@/server/logic/booking-conflicts";
import { shortDate } from "@/server/logic/date";
import { statusToLabel } from "@/server/supabase/codecs";

interface ConflictConfirmDialogProps {
  open: boolean;
  conflicts: readonly BookingConflict[];
  // 取消 (情境4): keeps the form as is, nothing was written.
  onCancel: () => void;
  // 仍要送出 (情境3/5/6): resend with these conflicts' ids acknowledged. A
  // fresh conflict appearing meanwhile is the caller's job — it updates
  // `conflicts` and this dialog shows whatever list it is given.
  onConfirmAnyway: () => Promise<unknown>;
}

// E-41 情境2/3/5: shown instead of writing the booking when submitBooking
// reports someone else's held, overlapping booking (blockers.conflicts).
// Built on the shared ConfirmDialog, which already owns the pending state
// while 仍要送出 is in flight.
export function ConflictConfirmDialog({ open, conflicts, onCancel, onConfirmAnyway }: ConflictConfirmDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => !next && onCancel()}
      title="這個時段已有其他預約"
      confirmLabel="仍要送出"
      onConfirm={onConfirmAnyway}
      description={
        // AlertDialogDescription renders a <p>, which only allows phrasing
        // content — a <ul> would be invalid here, so each row is an inline
        // <span> instead.
        <span className="block space-y-0.5">
          {conflicts.map((conflict) => (
            <span key={conflict.id} className="block">
              {shortDate(conflict.date)} {conflict.start}–{conflict.end} {conflict.renterName}（
              {statusToLabel(conflict.status)}）
            </span>
          ))}
        </span>
      }
    />
  );
}
