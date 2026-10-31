import { cva } from "class-variance-authority"

// A grid of choices with no radio dot; picked state uses a filled
// background instead of a border. Works on a button (aria-pressed) or a
// label wrapping a radio (has-data-checked). Every child shares one grid
// cell so the invisible radio — including base-ui's own hidden input —
// never pushes the centred text down.
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
