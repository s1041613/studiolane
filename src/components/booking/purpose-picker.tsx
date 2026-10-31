"use client";

import { controlVariants } from "@/components/ui/input";
import { optionTileVariants } from "@/components/ui/option-tile";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Purpose } from "@/server/logic/booking";
import type { PurposeOption } from "@/server/logic/purpose-rules";
import { purposeToLabel } from "@/server/supabase/codecs";

interface PurposePickerProps {
  purpose: Purpose | null;
  onChange: (purpose: Purpose) => void;
  // null until every slot has its times (F-用途-1). Archived purposes are
  // already left out (用途 U07).
  options: PurposeOption[] | null;
  invalid?: boolean;
}

// F-用途-2: purposes closed to this renter stay visible but greyed out, with
// the reason written inline (no hover on phones, so no tooltip).
export function PurposePicker({ purpose, onChange, options, invalid }: PurposePickerProps) {
  if (!options) {
    return <p className={`${controlVariants({ variant: "pending" })} flex items-center`}>請先填完每天的時間</p>;
  }

  return (
    <RadioGroup
      value={purpose ?? ""}
      onValueChange={(value) => onChange(value as Purpose)}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {options.map(({ purpose: p, availability }) => (
        <label
          key={p}
          className={optionTileVariants({ invalid: invalid ?? false })}
        >
          <RadioGroupItem value={p} disabled={!availability.ok} className="opacity-0" />
          <span>
            {purposeToLabel(p)}
            {!availability.ok && <span className="block text-xs text-warn">{availability.reason}</span>}
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}
