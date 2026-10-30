"use client";

import { useState } from "react";
import { controlVariants } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { HHmm } from "@/server/logic/booking";
// Same format rule the server applies (00:00–23:59, plus 24:00), so typing
// can't commit a value the server would reject as 時間格式不正確.
import { isValidHHmm } from "@/server/logic/booking-rules";

interface TimeComboboxProps {
  value: HHmm;
  onChange: (value: HHmm) => void;
  candidates: HHmm[];
  placeholder?: string;
  invalid?: boolean;
  // For a <label htmlFor>, or an aria-label when there is no visible label.
  id?: string;
  "aria-label"?: string;
  // The error element's id, so a screen reader reads the error on the field.
  describedBy?: string;
  disabled?: boolean;
  // Tidies what was typed when the list closes (settings: 「1330」→「13:30」).
  normalize?: (typed: string) => string;
}

// The one time picker for the whole app (docs/rental-time-rules D8): 預約教室
// and every settings form. A typeable combobox over a candidate list (see
// 與規格文件的差異 #7): typing filters the list. F-時間-10: whatever is typed —
// including an empty or malformed value — goes straight into the form, so the
// form shows 請填開始和結束時間 / 時間格式不正確 instead of silently keeping
// the old time.
export function TimeCombobox({
  value,
  onChange,
  candidates,
  placeholder,
  invalid,
  id,
  "aria-label": ariaLabel,
  describedBy,
  disabled,
  normalize,
}: TimeComboboxProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(value);
        else if (normalize && normalize(value) !== value) onChange(normalize(value));
      }}
    >
      <PopoverTrigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        className={`${controlVariants({ size: "sm", width: "time" })} text-left tabular-nums`}
      >
        {value || <span className="text-muted-foreground">{placeholder ?? "--:--"}</span>}
      </PopoverTrigger>
      <PopoverContent surface="menu" className="w-40">
        <Command>
          <CommandInput
            value={draft}
            onValueChange={(next) => {
              setDraft(next);
              onChange(next.trim());
            }}
            placeholder="輸入或選擇時間"
          />
          <CommandList>
            <CommandEmpty>
              {isValidHHmm(draft) ? "按 Enter 使用此時間" : "格式需為 HH:MM"}
            </CommandEmpty>
            <CommandGroup>
              {candidates.map((c) => (
                <CommandItem
                  key={c}
                  value={c}
                  onSelect={() => {
                    onChange(c);
                    setDraft(c);
                    setOpen(false);
                  }}
                >
                  {c}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
