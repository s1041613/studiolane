"use client";

import { Toggle } from "@/components/ui/toggle";

// 「顯示已停用（N）」: off by default so lists show what's in use; the count
// tells the counter there is something to reveal. A 開關方塊 in the toolbar
// (DESIGN.md §5.4), not a checkbox.
export function ShowArchivedToggle({
  archivedCount,
  checked,
  onCheckedChange,
}: {
  archivedCount: number;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Toggle variant="outline" size="control" pressed={checked} onPressedChange={onCheckedChange}>
      {showArchivedLabel(archivedCount)}
    </Toggle>
  );
}

export function showArchivedLabel(archivedCount: number): string {
  return `顯示已停用（${archivedCount}）`;
}
