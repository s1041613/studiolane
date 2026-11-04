"use client";

import { useEffect, useState } from "react";

// The current time, refreshed every 30 seconds. Null until mounted, so the
// server render and the first client render agree; callers render their
// time-free state until then.
export function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  return now;
}
