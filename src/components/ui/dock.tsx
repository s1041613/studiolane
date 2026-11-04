import type { ReactNode } from "react";
import { cn } from "cn";

// The floating icon bar at the bottom of the desktop: the step1 mockup's
// resolved "current macOS" `.dock` override (frosted glass, one hairline
// edge, no pinstripes).
function Dock({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-2.5 z-40 flex justify-center">
      <div
        role="toolbar"
        aria-label="Dock"
        className="pointer-events-auto flex items-end gap-1.5 rounded-[24px] bg-white/20 px-2.5 py-[7px] shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.6),0_0_0_0.5px_rgba(0,0,0,0.2),0_18px_40px_-12px_rgba(0,16,50,0.55),0_2px_8px_rgba(0,16,50,0.18)] backdrop-blur-[30px] backdrop-saturate-[1.8]"
      >
        {children}
      </div>
    </div>
  );
}

interface DockItemProps {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}

function DockItem({ label, active, onClick, icon }: DockItemProps) {
  return (
    <div className="group relative flex flex-col items-center">
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 rounded-md bg-white/85 px-2.5 py-1 text-[13px] whitespace-nowrap text-foreground opacity-0 shadow-[0_0_0_0.5px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.15)] backdrop-blur-xl transition-opacity duration-150",
          "group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className="grid size-14 place-items-center rounded-xl drop-shadow-[0_3px_4px_rgba(0,0,0,0.22)] outline-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
      >
        {icon}
      </button>
      <span
        aria-hidden="true"
        className={cn("mt-0.5 size-1 rounded-full bg-black/70 transition-opacity", active ? "opacity-100" : "opacity-0")}
      />
    </div>
  );
}

export { Dock, DockItem };
