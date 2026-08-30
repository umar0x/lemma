"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/text";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: ReactNode;
  active?: boolean;
}

export function IconButton({ label, icon, active, className, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-ctl border transition-all duration-150",
        active
          ? "border-[color-mix(in_srgb,var(--bronze)_35%,transparent)] bg-bronze-soft text-bronze"
          : "border-transparent text-ink-soft hover:border-line hover:bg-inset hover:text-ink",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}
