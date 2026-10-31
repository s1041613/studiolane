"use client";

import { controlVariants } from "@/components/ui/input";
import { optionTileVariants } from "@/components/ui/option-tile";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { PaymentChoice } from "@/server/logic/booking";
import { paymentMethodToLabel } from "@/server/supabase/codecs";

// F-付款-1: free bookings carry no payment method, so "free" is not an option.
const PAYMENTS: PaymentChoice[] = ["transfer", "on_site"];

interface PaymentPickerProps {
  payment: PaymentChoice;
  onChange: (payment: PaymentChoice) => void;
  // "pending" until a purpose is chosen; "free" when the rate is 0 (F-付款-2).
  mode: "pending" | "free" | "choose";
  // S-錯誤-4: outlined in red while the field has an error.
  invalid?: boolean;
}

export function PaymentPicker({ payment, onChange, mode, invalid }: PaymentPickerProps) {
  if (mode === "pending") {
    return <p className={`${controlVariants({ variant: "pending" })} flex items-center`}>請先選用途</p>;
  }
  if (mode === "free") {
    return <p className={`${controlVariants({ variant: "pending" })} flex items-center`}>無需付款（0 元）</p>;
  }

  return (
    <RadioGroup
      value={payment}
      onValueChange={(value) => onChange(value as PaymentChoice)}
      className="grid grid-cols-2 gap-2"
    >
      {PAYMENTS.map((p) => (
        <label
          key={p}
          className={optionTileVariants({ invalid: invalid ?? false })}
        >
          <RadioGroupItem value={p} className="opacity-0" />
          <span>{paymentMethodToLabel(p)}</span>
        </label>
      ))}
    </RadioGroup>
  );
}
