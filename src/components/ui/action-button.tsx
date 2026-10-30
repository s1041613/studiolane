"use client";

import { createContext, useContext, useState, useSyncExternalStore } from "react";
import type { ComponentProps, ReactNode } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClickGuard } from "@/lib/click-guard";
import type { ClickGuard } from "@/lib/click-guard";

const ActionGroupContext = createContext<ClickGuard | null>(null);

// BTN-2: every ActionButton inside one group shares a lock, so while one of
// a booking's actions is in flight the others are disabled too.
export function ActionGroup({ children }: { children: ReactNode }) {
  const [guard] = useState(() => createClickGuard());
  return <ActionGroupContext.Provider value={guard}>{children}</ActionGroupContext.Provider>;
}

type BaseProps = Omit<ComponentProps<typeof Button>, "onClick">;

type OnClickProps = BaseProps & {
  // The button owns pending/the spinner for the promise this returns. Never
  // caught here: `try { await onClick() } finally { setPending(false) }` —
  // a redirect() inside onClick rejects the promise and Next still
  // navigates (docs/e-8-error-handling/redirect-prototype.md); catching it
  // would turn a successful redirect into a swallowed error.
  onClick: () => Promise<unknown>;
  pending?: undefined;
};

type ExternalPendingProps = BaseProps & {
  // Pending is owned elsewhere (useActionState, a form's own `pending`
  // state) and just mirrored here: no onClick, no click guard — the thing
  // that already serializes the work drives this instead. For buttons whose
  // click is a native form submission (`type="submit"` inside the form that
  // actually performs the action), so Enter-to-submit keeps working.
  pending: boolean;
  onClick?: undefined;
};

type ActionButtonProps = OnClickProps | ExternalPendingProps;

// BTN-1..3: the app's button for anything that does something. In onClick
// mode it ignores repeat clicks within 300ms and, for async work, locks
// (with its group) until the result comes back; in external-pending mode it
// just reflects a pending flag someone else already serializes.
export function ActionButton(props: ActionButtonProps) {
  if (props.onClick) {
    const { onClick, ...rest } = props;
    return <OnClickActionButton {...rest} onClick={onClick} />;
  }
  const { pending, ...rest } = props;
  return <ExternalPendingButton {...rest} pending={pending} />;
}

function OnClickActionButton({
  onClick,
  disabled,
  children,
  ...props
}: Omit<OnClickProps, "pending">) {
  const group = useContext(ActionGroupContext);
  const [ownGuard] = useState(() => createClickGuard());
  const guard = group ?? ownGuard;
  const busy = useSyncExternalStore(guard.subscribe, guard.isBusy, () => false);
  const [running, setRunning] = useState(false);

  function handleClick() {
    void guard.run(async () => {
      setRunning(true);
      try {
        return await onClick();
      } finally {
        setRunning(false);
      }
    });
  }

  return (
    <Button {...props} disabled={disabled || busy} aria-busy={running || undefined} onClick={handleClick}>
      {/* The label stays put so it's always clear which action is running. */}
      {running && <Loader2Icon className="animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}

function ExternalPendingButton({
  pending,
  disabled,
  children,
  ...props
}: Omit<ExternalPendingProps, "onClick">) {
  return (
    <Button {...props} disabled={disabled || pending} aria-busy={pending || undefined}>
      {pending && <Loader2Icon className="animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}
