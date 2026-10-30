import type { ReactNode } from "react";

// The body of a settings sub-page: notices on top, then the content card
// (`<Card fill>`), which takes the remaining height on desktop (DESIGN.md §4).
export function SettingsBoard({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 md:min-h-0 md:flex-1">{children}</div>;
}
