"use client"

import { createContext, useContext, type ComponentProps, type ReactNode } from "react"
import { cn } from "cn"

// DESIGN.md §5.11 表單欄位: the one field layout for 預約教室 and every
// add/edit dialog. Each field is its own section with a divider between;
// the name sits 8px above the control, its hint on the same line to the
// right, and only errors go under the control.

// 「超過字數上限 40 字（目前 41 字）」, or undefined while within the limit.
// Counts characters, not UTF-16 units, so an emoji counts once.
export function overLengthMessage(text: string, max: number): string | undefined {
  const count = [...text.trim()].length
  return count > max ? `超過字數上限 ${max} 字（目前 ${count} 字）` : undefined
}

type FieldProps = {
  label: ReactNode
  // The control's id, for a <label>. Without it the name is a plain span with
  // `labelId`, for a group (segmented control) that points at it with
  // aria-labelledby.
  htmlFor?: string
  labelId?: string
  required?: boolean
  // A read-only form shows no required marks (§5.11 唯讀表單).
  readOnly?: boolean
  hint?: ReactNode
  // Step number for a form with an order (a multi-step form); stepDone turns it
  // solid once that step is complete.
  step?: number
  stepDone?: boolean
  error?: string
  // The error element's id. Field puts it on the <p> and hands it to
  // useFieldControl() below, so the control's aria-describedby is wired up
  // without the call site repeating it.
  describedById?: string
  // A sub-field (an optional extra inside the same section, e.g. IG): 13px
  // name, 12px under the control above, no divider of its own.
  sub?: boolean
  className?: string
  // Lets a form scroll its first error into view.
  "data-field"?: string
  children: ReactNode
}

// What a Field hands to the control it wraps: the id a <label htmlFor>
// points at, whether to mark it invalid, and the error element's id.
type FieldControl = { id: string | undefined; invalid: boolean; describedById: string | undefined }

const FieldControlContext = createContext<FieldControl | null>(null)

// Call this from the control's OWN component body — Input, NativeSelect,
// SegmentedControl, PersonPicker, ... — never spread as `{...useFieldControl()}`
// at a dialog's call site onto one of those components' props. A hook call
// written inline as a JSX prop still runs as part of the *caller's* render
// (the dialog's), one level above Field, not as a descendant of the
// Provider Field renders — so it silently reads nothing. It must run inside
// a function component that Field's children actually mount, which is why
// the primitives above call it themselves instead of trusting the call
// site. Outside any Field it returns empty wiring, so a control that also
// renders standalone (tests, other screens) stays safe.
export function useFieldControl(): {
  id: string | undefined
  "aria-invalid": true | undefined
  "aria-describedby": string | undefined
} {
  const ctx = useContext(FieldControlContext)
  return {
    id: ctx?.id,
    "aria-invalid": ctx?.invalid ? true : undefined,
    // Only once there's an error: that's the only time Field renders the
    // <p id={describedById}> this would point at. A Field with a
    // describedById prop but no current error must not describe a
    // non-existent element.
    "aria-describedby": ctx?.invalid ? ctx.describedById : undefined,
  }
}

// A labelled group of several controls (segmented choices, a list of rows)
// whose Field error is about the group as a whole: the group points at the
// error itself, and the controls inside get no wiring from that Field, so a
// group-level error doesn't mark every one of them invalid.
export function FieldGroup({ "aria-labelledby": labelledBy, children }: { "aria-labelledby": string; children: ReactNode }) {
  const ctx = useContext(FieldControlContext)
  return (
    <div role="group" aria-labelledby={labelledBy} aria-describedby={ctx?.invalid ? ctx.describedById : undefined}>
      <FieldControlContext.Provider value={null}>{children}</FieldControlContext.Provider>
    </div>
  )
}

// S-錯誤-3 / I-11: bring a form's first invalid field into view and focus
// its control. `field` is whatever value that field's `data-field` carries;
// null/undefined (no error found) is a no-op.
export function focusFirstError(field: string | null | undefined): void {
  if (!field) return
  // Run after React has committed the error state so the target exists.
  requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>(`[data-field="${field}"]`)
    target?.scrollIntoView({ behavior: "smooth", block: "center" })
    const focusable = target?.matches("input, select, textarea, button, [tabindex]")
      ? target
      : (target?.querySelector<HTMLElement>("input, select, textarea, button, [tabindex]") ?? null)
    focusable?.focus()
  })
}

export function Field({
  label,
  htmlFor,
  labelId,
  required,
  readOnly,
  hint,
  step,
  stepDone,
  error,
  describedById,
  sub,
  className,
  "data-field": dataField,
  children,
}: FieldProps) {
  const nameClass = sub ? "text-[13px] font-medium text-text-secondary" : "text-sm font-medium text-text-label"
  const name = (
    <>
      {label}
      {required && !readOnly && <span className="text-required"> *</span>}
    </>
  )

  return (
    <FieldControlContext.Provider value={{ id: htmlFor, invalid: !!error, describedById }}>
      <div
        data-slot={sub ? "sub-field" : "field"}
        data-field={dataField}
        className={cn(
          sub ? "mt-3" : "border-b border-divider py-[18px] first:pt-0 last:border-b-0 last:pb-0",
          className
        )}
      >
        <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {step !== undefined && (
            <span
              aria-hidden
              className={cn(
                "grid size-5 shrink-0 self-center place-items-center rounded-md text-xs font-medium",
                stepDone ? "bg-foreground text-background" : "bg-inset-border"
              )}
            >
              {step}
            </span>
          )}
          {htmlFor ? (
            <label htmlFor={htmlFor} className={nameClass}>
              {name}
            </label>
          ) : (
            <span id={labelId} className={nameClass}>
              {name}
            </span>
          )}
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </div>
        {children}
        {error && (
          <p id={describedById} className="mt-1.5 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </FieldControlContext.Provider>
  )
}

// Two short fields side by side in one section (手機／Email, A 間／B 間):
// the row carries the section's divider and 18px spacing, the fields inside
// drop theirs. Stacks on a phone.
export function FieldRow({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="field-row"
      className={cn(
        "grid gap-x-4 gap-y-[18px] border-b border-divider py-[18px] first:pt-0 last:border-b-0 last:pb-0 sm:grid-cols-2",
        "[&>[data-slot=field]]:border-b-0 [&>[data-slot=field]]:p-0",
        className
      )}
      {...props}
    />
  )
}

// A run of fields; the dividers come from each field.
export function FieldList({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="field-list" className={cn("flex flex-col", className)} {...props} />
}
