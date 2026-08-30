"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/text";

type Tone = "neutral" | "bronze" | "forest" | "oxblood" | "gold";

const TONES: Record<Tone, string> = {
  neutral: "bg-inset text-ink-soft border-line",
  bronze: "bg-bronze-soft text-bronze-ink border-[color-mix(in_srgb,var(--bronze)_30%,transparent)]",
  forest: "bg-forest-soft text-forest-ink border-[color-mix(in_srgb,var(--forest)_30%,transparent)]",
  oxblood: "bg-oxblood-soft text-oxblood-ink border-[color-mix(in_srgb,var(--oxblood)_28%,transparent)]",
  gold: "bg-bronze-soft text-gold border-[color-mix(in_srgb,var(--gold)_35%,transparent)]",
};

export interface BadgeProps {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = "neutral", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-[1px] text-[11px] font-medium leading-[16px] whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
