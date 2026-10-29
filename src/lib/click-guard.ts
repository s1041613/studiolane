export type ClickGuard = {
  isBusy: () => boolean;
  subscribe: (listener: () => void) => () => void;
  run: <T>(task: () => T | Promise<T>) => Promise<T | undefined>;
};

// BTN-1..3: drops clicks within `debounceMs` of the last accepted one, and
// while an async task is in flight drops every click until it settles
// (success or failure). Buttons that should lock together — all of one
// booking's actions — share a single guard.
export function createClickGuard({
  debounceMs = 300,
  now = Date.now,
}: { debounceMs?: number; now?: () => number } = {}): ClickGuard {
  let lastAcceptedAt = -Infinity;
  let busy = false;
  const listeners = new Set<() => void>();

  function setBusy(next: boolean) {
    busy = next;
    listeners.forEach((listener) => listener());
  }

  return {
    isBusy: () => busy,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async run(task) {
      if (busy || now() - lastAcceptedAt < debounceMs) return undefined;
      lastAcceptedAt = now();
      const result = task();
      if (!(result instanceof Promise)) return result;
      setBusy(true);
      try {
        return await result;
      } finally {
        setBusy(false);
      }
    },
  };
}
