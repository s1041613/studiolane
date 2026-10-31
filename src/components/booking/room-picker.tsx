"use client";

import { optionTileVariants } from "@/components/ui/option-tile";

interface RoomPickerProps {
  room: "A" | "B";
  onChange: (room: "A" | "B") => void;
  roomARate?: number;
  roomBRate?: number;
}

export function RoomPicker({ room, onChange, roomARate, roomBRate }: RoomPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["A", "B"] as const).map((r) => {
        const rate = r === "A" ? roomARate : roomBRate;
        const selected = room === r;
        return (
          <button
            key={r}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(r)}
            className={optionTileVariants()}
          >
            <span>
              <span className="block font-medium">{r === "A" ? "大教室 A" : "小教室 B"}</span>
              {rate != null && <span className="block text-sm text-muted-foreground">{rate}／小時</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
