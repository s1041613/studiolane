"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { TrafficLights } from "@/components/ui/traffic-lights";

export interface WidgetGalleryOption {
  id: string;
  name: string;
  // The widget itself at its real size, shown on the wallpaper-blue stage.
  preview: React.ReactNode;
}

interface WidgetGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: readonly WidgetGalleryOption[];
  onAdd: (id: string) => void;
}

// The 加入小工具 sheet: a list of widgets not yet on the desktop on the left,
// the selected one previewed on the right with the one action under it.
function WidgetGallery({ open, onOpenChange, options, onAdd }: WidgetGalleryProps) {
  const [pickedId, setPickedId] = React.useState<string | null>(null);
  const selected = options.find((option) => option.id === pickedId) ?? options[0];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-[150] bg-black/20" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-[150] flex h-[440px] w-[min(720px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[10px] bg-[rgba(237,242,250,0.9)] shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_18px_50px_rgba(0,10,40,0.6)] backdrop-blur-[34px] outline-none">
          <div className="relative flex h-10 flex-none items-center justify-center bg-[linear-gradient(180deg,#fbfcfe_0%,#eef1f6_50%,#dfe4ea_51%,#eef1f6_100%)] shadow-[inset_0_1px_0_#fff,0_1px_0_#bba891]">
            <TrafficLights className="absolute left-3" onClose={() => onOpenChange(false)} />
            <DialogPrimitive.Title className="text-[13.5px] font-bold">加入小工具</DialogPrimitive.Title>
          </div>
          <div className="flex min-h-0 flex-1">
            <ul role="listbox" aria-label="小工具" className="w-[200px] flex-none space-y-0.5 overflow-y-auto border-r border-black/10 p-2">
              {options.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.id === selected?.id}
                    onClick={() => setPickedId(option.id)}
                    className={cn(
                      "flex h-8 w-full items-center rounded-md px-2.5 text-left text-[13.5px]",
                      option.id === selected?.id ? "bg-[#0a6be0] text-white" : "hover:bg-black/5",
                    )}
                  >
                    {option.name}
                  </button>
                </li>
              ))}
            </ul>
            {selected && (
              <div className="flex min-w-0 flex-1 flex-col items-center gap-4 p-4">
                <div className="grid w-full flex-1 place-items-center overflow-hidden rounded-lg bg-[linear-gradient(180deg,#0a2f78_0%,#1356b8_45%,#2a7fe0_70%,#0d3f9a_100%)]">
                  {selected.preview}
                </div>
                <p className="text-[15px] font-semibold">{selected.name}</p>
                <button
                  type="button"
                  onClick={() => onAdd(selected.id)}
                  className="h-9 rounded-full bg-[linear-gradient(180deg,#6cb6ff,#0a6be0)] px-8 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_0_0_0.5px_rgba(0,0,0,0.3)]"
                >
                  加入小工具
                </button>
              </div>
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export { WidgetGallery };
