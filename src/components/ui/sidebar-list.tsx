import { useId } from "react"
import { cn } from "cn"

// A window's left-hand folder list, as its own inset pane: grouped
// sections, each item a small folder icon, a label, and a count. Counts
// stay quiet unless they ask for something: tone="accent" (blue) for a
// folder that still needs a decision, tone="danger" (red) for a live
// conflict.
export type FolderGlyph = "today" | "week" | "all" | "room" | "list"

export interface SidebarItem {
  key: string
  label: string
  count: number
  active: boolean
  glyph: FolderGlyph
  tone?: "accent" | "danger"
  onClick: () => void
}

export interface SidebarSection {
  title: string
  items: SidebarItem[]
}

const GLYPH_PATHS: Record<FolderGlyph, React.ReactNode> = {
  today: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.6V8l2.4 1.5" />
    </>
  ),
  week: (
    <>
      <rect x="2" y="3" width="12" height="11" rx="2" />
      <path d="M2 6.6h12M5 1.8v2.4M11 1.8v2.4M5 9.5h6" />
    </>
  ),
  all: (
    <>
      <path d="M2 9.6 4 3.5h8l2 6.1V13H2z" />
      <path d="M2 9.6h3.4l1 1.4h3.2l1-1.4H14" />
    </>
  ),
  room: (
    <>
      <path d="M2.5 7.4 8 3l5.5 4.4V14h-11z" />
      <path d="M6.6 14v-3.4h2.8V14" />
    </>
  ),
  list: (
    <>
      <path d="M5.5 4h8M5.5 8h8M5.5 12h8" />
      <circle cx="2.8" cy="4" r=".6" />
      <circle cx="2.8" cy="8" r=".6" />
      <circle cx="2.8" cy="12" r=".6" />
    </>
  ),
}

function FolderIcon({ glyph }: { glyph: FolderGlyph }) {
  // Each icon needs its own gradient id: several sidebars can be on screen.
  const gradientId = useId()
  return (
    <svg viewBox="0 0 24 20" aria-hidden="true" className="block h-5 w-6 flex-none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a9d2ff" />
          <stop offset=".55" stopColor="#5b9fe6" />
          <stop offset="1" stopColor="#3a7fcc" />
        </linearGradient>
      </defs>
      <path
        d="M1.5 4a1.5 1.5 0 0 1 1.5-1.5h6l2 2h10a1.5 1.5 0 0 1 1.5 1.5v10.5a1.5 1.5 0 0 1-1.5 1.5H3a1.5 1.5 0 0 1-1.5-1.5z"
        fill={`url(#${gradientId})`}
        stroke="#2f6aa8"
        strokeWidth=".8"
      />
      <path d="M2.3 7.2h19.4" stroke="rgba(255,255,255,.75)" />
      <g
        transform="translate(7.6 7.4) scale(.55)"
        fill="none"
        stroke="#7a4210"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {GLYPH_PATHS[glyph]}
      </g>
    </svg>
  )
}

const ACTIVE_STYLE: React.CSSProperties = {
  backgroundImage: "linear-gradient(180deg, #6fb2fa 0%, #2b7de9 48%, #1d5fb8 52%, #2b7de9 85%, #4fa0f6 100%)",
  textShadow: "0 1px 1px rgba(0,40,110,0.55)",
  boxShadow: "inset 0 1px 1px rgba(255,255,255,0.6), 0 0 0 1px #1d5fb8, 0 1px 2px rgba(80,40,0,0.3)",
}

const COUNT_TONE = {
  accent: "font-bold text-link",
  danger: "text-destructive",
} as const

function SidebarList({ sections, label, className }: { sections: SidebarSection[]; label: string; className?: string }) {
  return (
    <nav
      aria-label={label}
      className={cn("overflow-y-auto rounded-[7px] px-1.5 pt-2 pb-2.5", className)}
      style={{
        background: "rgba(244,248,252,0.78)",
        boxShadow: "inset 0 0 0 1px rgba(120,95,70,0.32), inset 0 1px 2px rgba(80,60,40,0.1)",
      }}
    >
      {sections.map((section, index) => (
        <div key={section.title}>
          <h2
            className={cn(
              "mx-2 mb-[3px] text-[11px] font-bold tracking-[.02em] text-muted-foreground",
              index > 0 && "mt-2.5 border-t border-[rgba(120,95,70,0.18)] pt-[9px]"
            )}
          >
            {section.title}
          </h2>
          <ul>
            {section.items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  aria-current={item.active || undefined}
                  onClick={item.onClick}
                  className={cn(
                    "flex min-h-7 w-full cursor-default items-center gap-[7px] rounded-md px-2 py-[3px] text-left text-[13px] leading-[1.35]",
                    item.active ? "font-semibold text-white" : "text-foreground hover:bg-[rgba(110,94,81,0.1)]"
                  )}
                  style={item.active ? ACTIVE_STYLE : undefined}
                >
                  <FolderIcon glyph={item.glyph} />
                  <span className="truncate">{item.label}</span>
                  <span
                    className={cn(
                      "ml-auto text-[11.5px] tabular-nums",
                      item.active ? "text-white" : item.tone ? COUNT_TONE[item.tone] : "text-muted-foreground"
                    )}
                  >
                    {item.count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export { SidebarList }
