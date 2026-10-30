"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useFieldControl } from "@/components/ui/field";

export type SegmentOption<T extends string> = { value: T; label: string; disabled?: boolean };

// The toggle group reports every pressed item; pressing the chosen one again
// empties it. A segmented control always has exactly one choice, so keep the
// current value in that case.
export function singleSelection<T extends string>(pressed: readonly T[], current: T): T {
  return pressed[0] ?? current;
}

// The toggle group types pressed values as plain strings; map them back to
// the options (in option order) instead of casting.
function pressedOptions<T extends string>(pressed: readonly string[], options: readonly SegmentOption<T>[]): T[] {
  return options.map((option) => option.value).filter((value) => pressed.includes(value));
}

// Set when the field shows an error, so a screen reader reads the error text
// on reaching the group: aria-describedby points at the error element's id.
type FieldErrorAria = {
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

type SegmentedControlProps<T extends string> = FieldErrorAria & {
  options: readonly SegmentOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  disabled?: boolean;
  "aria-label": string;
};

// One-of-few choice shown as joined buttons: 身分 (人員名單, 價格方案),
// 每週固定／只有某一天 (租借時段), 常態課／特別課 (課表).
export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  disabled,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: SegmentedControlProps<T>) {
  // E-19: see Input's comment in ui/input.tsx — must read the Field this
  // sits in from here, not via a hook call spread at the call site. No id:
  // a segmented control is a group, labelled by Field's labelId/aria-label,
  // never a <label htmlFor>.
  const field = useFieldControl();
  return (
    <ToggleGroup
      aria-label={ariaLabel}
      aria-invalid={(ariaInvalid ?? field["aria-invalid"]) || undefined}
      aria-describedby={ariaDescribedBy ?? field["aria-describedby"]}
      variant="track"
      spacing={1}
      value={[value]}
      onValueChange={(pressed) => onValueChange(singleSelection(pressedOptions(pressed, options), value))}
      disabled={disabled}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

type MultiSegmentedControlProps<T extends string> = FieldErrorAria & {
  options: readonly SegmentOption<T>[];
  value: readonly T[];
  onValueChange: (value: T[]) => void;
  disabled?: boolean;
  "aria-label": string;
};

// Several-of-few choice with the same look: 可使用身分 (用途), 教室 (租借時段).
export function MultiSegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  disabled,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: MultiSegmentedControlProps<T>) {
  return (
    <ToggleGroup
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid || undefined}
      aria-describedby={ariaDescribedBy}
      variant="track"
      spacing={1}
      multiple
      value={value}
      onValueChange={(pressed) => onValueChange(pressedOptions(pressed, options))}
      disabled={disabled}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
