"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/text";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-brand text-[#fdf9f0] hover:brightness-110 active:brightness-95 shadow-soft border border-[rgba(60,32,6,0.28)]",
  secondary:
    "bg-card text-ink border border-line hover:border-line-strong hover:bg-inset shadow-soft",
  ghost: "text-ink-soft hover:text-ink hover:bg-inset border border-transparent",
  danger: "bg-oxblood-soft text-oxblood-ink border border-[color-mix(in_srgb,var(--oxblood)_28%,transparent)] hover:brightness-97",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[12.5px] gap-1.5 rounded-ctl",
  md: "h-8 px-3 text-[13px] gap-2 rounded-ctl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
}

export function Button({ variant = "secondary", size = "md", className, children, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex select-none items-center justify-center font-medium tracking-[-0.01em] transition-all duration-150 disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
