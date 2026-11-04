"use client";

import { useState, type ReactNode } from "react";
import { SearchIcon } from "lucide-react";
import { PaymentMethod, RentalStatus } from "@/server/types/home";
import { paymentMethodToLabel, statusToLabel } from "@/server/supabase/codecs";
import { ALL_STATUSES } from "@/server/logic/bookings";
import type { BookingFilterDraft } from "@/server/logic/bookings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateRangeField } from "@/components/ui/date-range-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_OPTIONS = ALL_STATUSES;

// "" is 全部付款方式; "none" matches free bookings, which have no payment
// method (T-列表-1).
const PAY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "全部付款方式" },
  { value: PaymentMethod.OnSite, label: paymentMethodToLabel(PaymentMethod.OnSite) },
  { value: PaymentMethod.Transfer, label: paymentMethodToLabel(PaymentMethod.Transfer) },
  { value: "none", label: "無需付款" },
];

function payLabel(value: string): string {
  return PAY_OPTIONS.find((option) => option.value === value)?.label ?? PAY_OPTIONS[0].label;
}

// 下拉複選: chosen statuses joined with 「、」; every status ticked, or
// none (which filters nothing), reads 全部狀態.
function statusSummary(statuses: readonly RentalStatus[]): string {
  return statuses.length === 0 || statuses.length === STATUS_OPTIONS.length
    ? "全部狀態"
    : statuses.map(statusToLabel).join("、");
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <span className="block text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

// One card, one row on desktop. Edits stay in a draft until 查詢 hands them
// to the page; the page holds the applied filters, not the URL.
export function BookingFilters({
  initial,
  onApply,
}: {
  initial: BookingFilterDraft;
  onApply: (filters: BookingFilterDraft) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const update = (patch: Partial<BookingFilterDraft>) => setDraft((current) => ({ ...current, ...patch }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onApply({ ...draft, q: draft.q.trim() });
  }

  return (
    <form onSubmit={submit}>
      {/* items-start: every label sits on one line and every control is 44px,
          so the controls line up even though the select adds a hidden input
          under its trigger. */}
      <Card className="grid items-start gap-4 md:grid-cols-[1.5fr_1fr_1fr_2fr_auto]">
        <FilterField label="搜尋">
          <Input
            type="search"
            aria-label="搜尋"
            placeholder="姓名或租借 ID"
            value={draft.q}
            onChange={(e) => update({ q: e.target.value })}
          />
        </FilterField>

        <FilterField label="付款方式">
          <Select value={draft.pay} onValueChange={(value) => update({ pay: String(value ?? "") })}>
            <SelectTrigger aria-label="付款方式">
              <SelectValue>{(value: string) => payLabel(value)}</SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {PAY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="狀態（可複選）">
          <Select multiple value={draft.statuses} onValueChange={(value) => update({ statuses: value as RentalStatus[] })}>
            <SelectTrigger aria-label="狀態">
              <SelectValue>
                {(value: RentalStatus[]) => <span className="truncate">{statusSummary(value)}</span>}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status} indicator="checkbox">
                  {statusToLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="預約日期">
          <DateRangeField
            aria-label="預約日期"
            placeholder="選擇日期"
            value={draft.from ? { from: draft.from, to: draft.to } : null}
            onChange={(range) => update({ from: range?.from ?? "", to: range?.to ?? "" })}
          />
        </FilterField>

        {/* Just the magnifier, no box. The invisible label keeps it level
            with the controls beside it. */}
        <div className="space-y-1.5">
          <span aria-hidden className="invisible hidden text-xs md:block">
            查詢
          </span>
          <Button type="submit" variant="ghost" size="icon-lg" aria-label="查詢" title="查詢" className="size-11">
            <SearchIcon />
          </Button>
        </div>
      </Card>
    </form>
  );
}
