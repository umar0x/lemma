"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/text";
import { IconButton } from "./IconButton";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  width?: string;
}

export function Dialog({ open, onClose, title, description, children, width = "560px" }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-[rgba(20,15,9,0.42)] backdrop-blur-[3px]" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ maxWidth: width }}
        className={cn(
          "relative z-10 w-full animate-fade-in-up rounded-panel border border-line bg-card shadow-panel outline-none",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
            {description ? <p className="mt-0.5 text-[12.5px] text-ink-soft">{description}</p> : null}
          </div>
          <IconButton label="Close dialog" icon={<X size={15} />} onClick={onClose} />
        </div>
        <div className="max-h-[calc(100dvh-180px)] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
