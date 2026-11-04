import { cn } from "cn"

// A window's left-hand folder list: grouped sections, each item showing a
// quiet count — 撞單's count alone is read in red (tone="danger") so a
// live conflict stands out among otherwise-quiet numbers.
export interface SidebarItem {
  key: string
  label: string
  count: number
  active: boolean
  tone?: "danger"
  onClick: () => void
}

export interface SidebarSection {
  title: string
  items: SidebarItem[]
}

function SidebarList({ sections, label }: { sections: SidebarSection[]; label: string }) {
  return (
    <nav aria-label={label} className="flex flex-col gap-4 overflow-y-auto px-2 py-3 text-sm">
      {sections.map((section) => (
        <div key={section.title}>
          <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">{section.title}</h2>
          <ul>
            {section.items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  aria-current={item.active || undefined}
                  onClick={item.onClick}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                    item.active ? "bg-selected font-medium text-foreground" : "text-secondary-foreground hover:bg-white/55"
                  )}
                >
                  <span className="truncate">{item.label}</span>
                  <span
                    className={cn(
                      "tabular-nums",
                      item.tone === "danger" ? "text-destructive" : "text-muted-foreground"
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
