import type { ComponentProps } from "react"
import {
  BanIcon,
  CircleCheckIcon,
  EllipsisIcon,
  EyeIcon,
  PencilIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"

// DESIGN.md §5.9 列表列的動作按鈕: one 32px icon button per action, always
// shown (tablets have no hover). 停用 and 刪除 warn in red on hover, 啟用 in
// green. 啟用 is circle-check, the pair of 停用's ban (user, 2026-10-15).
type RowActionTone = "neutral" | "danger" | "success"

const ROW_ACTIONS = {
  edit: { icon: PencilIcon, label: "編輯", tone: "neutral" },
  archive: { icon: BanIcon, label: "停用", tone: "danger" },
  reactivate: { icon: CircleCheckIcon, label: "啟用", tone: "success" },
  delete: { icon: Trash2Icon, label: "刪除", tone: "danger" },
  more: { icon: EllipsisIcon, label: "更多", tone: "neutral" },
  view: { icon: EyeIcon, label: "查看", tone: "neutral" },
} as const satisfies Record<string, { icon: LucideIcon; label: string; tone: RowActionTone }>

export type RowActionKind = keyof typeof ROW_ACTIONS

const TONE_HOVER: Record<RowActionTone, string> = {
  neutral: "",
  danger: "hover:bg-danger-bg hover:text-destructive",
  success: "hover:bg-success/10 hover:text-success",
}

type RowActionProps = Omit<ComponentProps<typeof Button>, "variant" | "size" | "children"> & {
  action: RowActionKind
  // What the row is, for the accessible name: 「編輯 Amber」.
  target: string
  // Set when this row can't take the action: the button stays in place
  // (every row keeps the same buttons), dimmed, and hovering shows why.
  disabledReason?: string
}

export function RowAction({ action, target, disabledReason, onClick, className, ...props }: RowActionProps) {
  const { icon: Icon, label, tone } = ROW_ACTIONS[action]
  const unavailable = disabledReason !== undefined

  return (
    <Button
      type="button"
      variant="row-action"
      size="icon"
      aria-label={`${label} ${target}`}
      title={disabledReason ?? label}
      // aria-disabled, not disabled: a disabled button gets no hover, so its
      // title (the reason) would never show.
      aria-disabled={unavailable || undefined}
      onClick={unavailable ? undefined : onClick}
      className={cn(
        unavailable ? "cursor-not-allowed opacity-40 hover:bg-row-action" : TONE_HOVER[tone],
        className
      )}
      {...props}
    >
      <Icon aria-hidden />
    </Button>
  )
}

// The row's buttons, right-aligned 6px apart.
export function RowActions({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex justify-end gap-1.5", className)} {...props} />
}
