import { cva } from "class-variance-authority"

// DESIGN.md §5.4 選項方塊格: a grid of choices (教室、用途、付款方式) with no
// radio dot; picked = #C7D0D2 without a border. Works on a button with
// aria-pressed or on a label wrapping a radio (has-data-checked). Every
// child shares one grid cell, so the invisible radio (and base-ui's hidden
// input) never pushes the centred text down.
export const optionTileVariants = cva(
  "grid min-h-11 place-items-center rounded-lg border px-3.5 py-2.5 text-center text-sm outline-none focus-visible:ring-[1.5px] focus-visible:ring-foreground has-focus-visible:ring-[1.5px] has-focus-visible:ring-foreground *:col-start-1 *:row-start-1 transition-colors aria-pressed:border-transparent aria-pressed:bg-selected aria-pressed:font-medium has-data-checked:border-transparent has-data-checked:bg-selected has-data-checked:font-medium has-data-disabled:bg-transparent has-data-disabled:opacity-55",
  {
    variants: {
      invalid: {
        false: "border-control-border bg-control hover:border-control-border-hover",
        true: "border-destructive bg-control",
      },
    },
    defaultVariants: { invalid: false },
  }
)
