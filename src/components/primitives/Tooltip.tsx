"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/text";

export interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: "top" | "bottom";
  align?: "center" | "start" | "end";
}

export function Tooltip({ content, children, side = "top", align = "center" }: TooltipProps) {
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-[70] rounded-[7px] bg-ink px-2 py-1 text-[11px] font-medium whitespace-nowrap text-paper opacity-0 shadow-raised transition-opacity duration-150 group-focus-within/tooltip:opacity-100 group-hover/tooltip:opacity-100",
          side === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "start" && "left-0",
          align === "end" && "right-0",
        )}
      >
        {content}
      </span>
    </span>
  );
}
