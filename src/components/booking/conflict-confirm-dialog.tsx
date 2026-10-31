"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { BookingConflict } from "@/server/logic/booking-conflicts";
import { shortDate } from "@/server/logic/date";
import { statusToLabel } from "@/server/supabase/codecs";

interface ConflictConfirmDialogProps {
  open: boolean;
  conflicts: readonly BookingConflict[];
  // 取消: keeps the form as is, nothing was written.
  onCancel: () => void;
  // 仍要送出: resend with these conflicts' ids acknowledged. A fresh
  // conflict appearing meanwhile is the caller's job — it updates
  // `conflicts` and this dialog shows whatever list it's given.
  onConfirmAnyway: () => Promise<unknown>;
}

// Shown instead of writing the booking when submitBooking reports someone
// else's held, overlapping booking. Built on the shared ConfirmDialog,
// which already owns the pending state while 仍要送出 is in flight.
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
        // content, so each row is an inline <span> rather than a <ul>.
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
