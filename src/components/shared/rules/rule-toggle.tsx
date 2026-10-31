"use client";

import { useRef, useState } from "react";
import { failBlockers } from "@/lib/result";
import { settle } from "@/lib/settle";
import { archiveRentalRule, previewRuleArchive, reactivateRentalRule } from "@/server/actions/rental-rules";
import type { RentalRule } from "@/server/logic/booking-rules";
import { ruleDayLabel } from "@/server/logic/rental-rules";
import { brokenRentalsMessage } from "@/server/logic/rule-impact";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NoticeDialog } from "@/components/ui/notice-dialog";
import { ActionFailure, type ShownFailure } from "@/components/shared/failures/action-failure";

// What the page shows above the list when a 停用／啟用 fails; a refusal that
// lists what blocks it opens the notice instead.
export type ToggleFailure = ShownFailure;

const NOUN = "租借規則";

export function ruleLine(rule: RentalRule): string {
  return `${ruleDayLabel(rule)} ${rule.start}–${rule.end} ${rule.reason}`;
}

function confirmCopy(rule: RentalRule): { title: string; description: string; confirm: string } {
  if (rule.archivedAt !== null) {
    return {
      title: `啟用這個${NOUN}？`,
      description: rule.effect === "open" ? "啟用後這段時間恢復開放租借。" : "啟用後這段時間不能預約。",
      confirm: "啟用",
    };
  }
  return {
    title: `停用這個${NOUN}？`,
    description: rule.effect === "open" ? "停用後這段時間恢復不能租，之後可以再啟用。" : "停用後這段時間將開放預約，之後可以再啟用。",
    confirm: "停用",
  };
}

type Blocked = { title: string; failure: ShownFailure };

// 停用／啟用 first asks the server whether the change would break bookings.
// If it would, a NoticeDialog lists them with only 確定; otherwise the
// usual confirmation.
export function useRuleToggle(onDone: (message: string) => void, onError: (failure: ToggleFailure) => void) {
  const [target, setTarget] = useState<RentalRule | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  // Only the latest click counts, and row buttons stay locked while a
  // check is in flight so an older answer can't retarget the dialog.
  const [checking, setChecking] = useState(false);
  const latestAsk = useRef(0);

  function blockedFrom(rule: RentalRule, failure: ShownFailure): Blocked {
    const action = rule.archivedAt === null ? "停用" : "啟用";
    return { title: `這個${NOUN}不能${action}`, failure };
  }

  async function ask(rule: RentalRule) {
    if (checking) return;
    const ticket = ++latestAsk.current;
    const archive = rule.archivedAt === null;
    setChecking(true);
    const impact = await settle(previewRuleArchive(rule.id, archive));
    if (ticket !== latestAsk.current) return;
    setChecking(false);
    if (!impact.ok) return onError(impact.error);
    const { rentals } = impact.data;
    if (rentals.length > 0) {
      // Worked out before calling archive, so there is no error code.
      const refusal = failBlockers(
        "FAILED_PRECONDITION",
        `${brokenRentalsMessage(rentals.length, archive ? "停用" : "啟用")}，請先改期或取消：`,
        { conflicts: rentals },
      );
      setBlocked(blockedFrom(rule, refusal.error));
      return;
    }
    setTarget(rule);
    setConfirmOpen(true);
  }

  async function confirm() {
    if (!target) return;
    const result = await settle(target.archivedAt === null ? archiveRentalRule(target.id) : reactivateRentalRule(target.id));
    setConfirmOpen(false);
    if (result.ok) onDone(result.data);
    else if (result.error.kind === "blockers") setBlocked(blockedFrom(target, result.error));
    else onError(result.error);
  }

  const copy = target ? confirmCopy(target) : null;
  const dialogs = (
    <>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={copy?.title ?? ""}
        description={target ? `${ruleLine(target)}。${copy?.description ?? ""}` : undefined}
        confirmLabel={copy?.confirm ?? ""}
        destructive={target?.archivedAt === null}
        onConfirm={confirm}
      />
      <NoticeDialog
        open={blocked !== null}
        onOpenChange={(open) => !open && setBlocked(null)}
        title={blocked?.title ?? ""}
        description={blocked?.failure.message}
      >
        {blocked && <ActionFailure variant="notice" failure={blocked.failure} />}
      </NoticeDialog>
    </>
  );

  return { ask, checking, dialogs };
}
