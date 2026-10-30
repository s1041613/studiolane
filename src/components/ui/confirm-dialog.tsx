"use client";

import { useState, type ReactNode } from "react";
import { Loader2Icon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  // 停用 and other actions that take something away use the destructive look.
  destructive?: boolean;
  // The dialog owns pending itself: a spinner on the confirm button,
  // disabled (with Cancel) while it runs, and it can't be dismissed until
  // it settles. Never caught here: `try { await onConfirm() } finally {
  // setPending(false) }` — a redirect() inside onConfirm must keep
  // rejecting so Next still navigates (docs/e-8-error-handling/
  // redirect-prototype.md). Whether a failed result should keep the dialog
  // open is the caller's call, via `open`/`onOpenChange` as always — this
  // only guards against closing *while the promise is still in flight*.
  onConfirm: () => Promise<unknown>;
};

// Every settings page's 停用／啟用 confirmation, and the 「放棄這次的修改？」
// prompt, share this one dialog so they read and behave the same.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "取消",
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={() => void handleConfirm()}
          >
            {pending && <Loader2Icon className="animate-spin" aria-hidden />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// 人員名單 I-05, 價格方案 I-06: pairs with useDiscardGuard.
export function DiscardChangesDialog({
  open,
  onDiscard,
  onKeepEditing,
}: {
  open: boolean;
  onDiscard: () => void;
  onKeepEditing: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => !next && onKeepEditing()}
      title="放棄這次的修改？"
      confirmLabel="放棄"
      cancelLabel="繼續編輯"
      destructive
      onConfirm={async () => onDiscard()}
    />
  );
}

// What closing a settings dialog should do: a changed form asks first
// (人員名單 I-05, 價格方案 I-06), an untouched one just closes.
export function closeRequest(isDirty: boolean): "confirm" | "close" {
  return isDirty ? "confirm" : "close";
}

// Wire requestClose to every way out of the dialog (Esc, click outside,
// 取消); render <DiscardChangesDialog> with the rest.
export function useDiscardGuard(isDirty: boolean, onClose: () => void) {
  const [confirming, setConfirming] = useState(false);
  return {
    confirming,
    requestClose: () => (closeRequest(isDirty) === "confirm" ? setConfirming(true) : onClose()),
    discard: () => {
      setConfirming(false);
      onClose();
    },
    keepEditing: () => setConfirming(false),
  };
}
