import { cn } from "cn";

// The three window-control dots in a title bar, styled as the Aqua
// (2001-2003) metallic gel spheres from the step1 mockup's `.light` override
// (docs/desktop-booking-v1/mockups/step1-shell.html). Values below are the
// browser's resolved background/box-shadow for `.light.close/.min/.max`,
// not the mockup's `color-mix()` source — the cascade already settled which
// override wins, so this ports the computed result. Only close does
// anything in v1; min/max are decorative placeholders until a later step
// gives them a job (minimize, full screen).
interface TrafficLightsProps {
  onClose: () => void;
  closeLabel?: string;
  className?: string;
}

type LightTone = "close" | "min" | "max";

const LIGHT_STYLE: Record<LightTone, { background: string; boxShadow: string }> = {
  close: {
    background:
      "radial-gradient(circle at 35% 28%, #fff 0, #fff 8%, oklch(0.86212 0.0884098 26.3652) 22%, #ff5f57 55%, oklch(0.485526 0.137484 26.3652) 100%)",
    boxShadow:
      "inset 0 0 0 0.6px oklch(0.381484 0.108023 26.3652), inset 0 -1.5px 2px oklch(0.816162 0.117863 26.3652), inset 0 1px 1.5px rgba(0,0,0,0.18), 0 0.5px 1px rgba(0,0,0,0.3)",
  },
  min: {
    background:
      "radial-gradient(circle at 35% 28%, #fff 0, #fff 8%, oklch(0.925649 0.0725765 80.8979) 22%, #febc2e 55%, oklch(0.584348 0.112854 80.8979) 100%)",
    boxShadow:
      "inset 0 0 0 0.6px oklch(0.459131 0.0886711 80.8979), inset 0 -1.5px 2px oklch(0.900868 0.096752 80.8979), inset 0 1px 1.5px rgba(0,0,0,0.18), 0 0.5px 1px rgba(0,0,0,0.3)",
  },
  max: {
    background:
      "radial-gradient(circle at 35% 28%, #fff 0, #fff 8%, oklch(0.877609 0.0978174 144.705) 22%, #28c840 55%, oklch(0.50962 0.152118 144.705) 100%)",
    boxShadow:
      "inset 0 0 0 0.6px oklch(0.400415 0.119521 144.705), inset 0 -1.5px 2px oklch(0.836814 0.130407 144.705), inset 0 1px 1.5px rgba(0,0,0,0.18), 0 0.5px 1px rgba(0,0,0,0.3)",
  },
};

// The small top gloss highlight every sphere gets (`.light::before`).
const GLOSS_CLASS =
  "before:absolute before:top-px before:left-[3px] before:right-[3px] before:h-[4.5px] before:rounded-full before:bg-gradient-to-b before:from-white/90 before:to-white/0 before:content-['']";

function Light({ tone, className }: { tone: LightTone; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("relative block size-[13px] rounded-full", GLOSS_CLASS, className)} style={LIGHT_STYLE[tone]} />
  );
}

function TrafficLights({ onClose, closeLabel = "關閉視窗", className }: TrafficLightsProps) {
  return (
    <div className={cn("group flex items-center gap-2", className)}>
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className={cn("relative grid size-[13px] cursor-pointer place-items-center rounded-full", GLOSS_CLASS)}
        style={LIGHT_STYLE.close}
      >
        <svg viewBox="0 0 6 6" className="relative size-[6px] opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60">
          <path d="M1 1l4 4M5 1 1 5" stroke="#7a1f1a" strokeWidth="1.1" />
        </svg>
      </button>
      <Light tone="min" />
      <Light tone="max" />
    </div>
  );
}

export { TrafficLights };
