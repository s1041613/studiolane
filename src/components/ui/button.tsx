import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-[1.5px] focus-visible:ring-foreground active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[1.5px] aria-invalid:ring-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // DESIGN.md §5.1 主按鈕: soft lime gradient that slides right on hover.
        default:
          "border-white/85 bg-(image:--eb-primary-gradient) bg-size-[180%_100%] bg-left text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/.8)] transition-[background-position,translate] duration-350 ease-(--eb-ease) hover:bg-right disabled:saturate-[.3]",
        outline:
          "border-control-border bg-control hover:border-control-border-hover aria-expanded:border-control-border-hover",
        secondary:
          "bg-inset text-secondary-foreground hover:bg-selected aria-expanded:bg-selected",
        ghost:
          "hover:bg-white/60 hover:text-foreground aria-expanded:bg-white/60 aria-expanded:text-foreground",
        // DESIGN.md §5.2 圖示按鈕.
        icon: "bg-icon-btn text-foreground hover:bg-icon-btn-hover aria-expanded:bg-icon-btn-active",
        // DESIGN.md §5.10: the confirm button of a 刪除／停用 confirmation is solid #B4471F.
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive",
        // DESIGN.md §5.11 彈窗的刪除: red text and icon, no fill until hover.
        "destructive-ghost":
          "text-destructive hover:bg-danger-bg focus-visible:ring-destructive",
        // DESIGN.md §5.9 / §5.10: row actions and the dialog's ✕.
        "row-action":
          "bg-row-action text-text-secondary hover:bg-icon-btn aria-expanded:bg-icon-btn",
        link: "text-primary underline-offset-4 hover:underline",
        // Login screen only: the lime gradient in `default` is for in-app
        // actions (DESIGN.md §5.1), the login screenshot's button is solid dark.
        dark: "border-transparent bg-foreground text-background hover:opacity-90",
      },
      size: {
        default:
          "h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 rounded-sm px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        // Buttons inside table rows: 32px, radius S.
        sm: "h-8 gap-1 rounded-md px-3 text-[0.8rem] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        // The page's main action (送出預約, 儲存).
        lg: "h-[42px] gap-1.5 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-8 rounded-md",
        "icon-xs": "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-[30px] rounded-md",
        "icon-lg": "size-10 [&_svg:not([class*='size-'])]:size-[18px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
