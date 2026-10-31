"use client";

import { useState } from "react";
import { useFieldControl } from "@/components/ui/field";
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
import type { RosterEntry } from "@/server/logic/pricing";
import { namesakeHint, sameName } from "@/server/logic/roster";
import { scoreRosterKeywords } from "@/components/shared/people/roster-search";

// One searchable combobox shared by every person-picking field (租借人、
// 老師、代課老師、原老師). Every call site looks and behaves the same; the
// only difference is whether typing a name that isn't listed may add it,
// controlled by `create`.
export type PersonPick = { kind: "existing"; person: RosterEntry } | { kind: "new"; name: string };

// Closed: only the listed people can be picked — no 「新增」 row for an
// unknown name. Open: a typed name that isn't listed offers to add it,
// worded by `label` (defaults to 新增「name」).
export type PersonPickerCreate = { kind: "closed" } | { kind: "open"; label?: (name: string) => string };

// The name a 「新增」 row would add, or null when none is offered: nothing
// typed, the name is already listed (case-insensitive — "UU" matches
// listed "uu"), or `create` is closed.
export function newPersonOffer(query: string, people: readonly RosterEntry[], create: PersonPickerCreate): string | null {
  const name = query.trim();
  if (create.kind === "closed" || !name || people.some((entry) => sameName(entry.name, name))) return null;
  return name;
}

interface PersonPickerProps {
  people: RosterEntry[];
  // What the trigger shows for the current value; "" shows the placeholder.
  selectedLabel: string;
  placeholder: string;
  create: PersonPickerCreate;
  onChange: (pick: PersonPick) => void;
  disabled?: boolean;
  // "pending": dashed border, transparent, muted text — a locked value,
  // not merely disabled (e.g. 代課's 原老師 once editing; same look
  // NativeSelect/Input use for that case).
  variant?: "default" | "pending";
}

export function PersonPicker({ people, selectedLabel, placeholder, create, onChange, disabled, variant }: PersonPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The Field this picker sits in owns id/aria-invalid/aria-describedby
  // (src/components/ui/field.tsx) — never wire those by hand here.
  const control = useFieldControl();

  const trimmedQuery = query.trim();
  const offer = newPersonOffer(query, people, create);
  const newEntryLabel = create.kind === "open" ? create.label ?? ((name: string) => `新增「${name}」`) : undefined;

  function choose(pick: PersonPick) {
    onChange(pick);
    setQuery("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger {...control} disabled={disabled} className={`${controlVariants({ variant })} text-left`}>
        {selectedLabel || <span className="text-muted-foreground">{placeholder}</span>}
      </PopoverTrigger>
      <PopoverContent surface="menu" className="w-(--anchor-width)">
        <Command filter={scoreRosterKeywords}>
          <CommandInput placeholder="搜尋姓名…" value={query} onValueChange={setQuery} />
          <CommandList>
            {create.kind === "closed" && <CommandEmpty>找不到符合的人員</CommandEmpty>}
            {!people.length && !trimmedQuery && create.kind === "open" && (
              <div className="py-6 text-center text-sm text-muted-foreground">找不到符合的人員</div>
            )}
            <CommandGroup>
              {people.map((entry) => {
                const hint = namesakeHint(entry, people);
                return (
                  <CommandItem
                    key={entry.id}
                    value={entry.id}
                    keywords={[entry.name]}
                    onSelect={() => choose({ kind: "existing", person: entry })}
                  >
                    {entry.name}
                    {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
                  </CommandItem>
                );
              })}
              {offer && newEntryLabel && (
                <CommandItem
                  key="__new__"
                  value={`__new__${offer}`}
                  keywords={[offer]}
                  onSelect={() => choose({ kind: "new", name: offer })}
                >
                  {newEntryLabel(offer)}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
