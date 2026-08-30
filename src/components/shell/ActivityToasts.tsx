"use client";

import { useEffect } from "react";
import {
  CheckCircle2,
  Eye,
  FilePlus2,
  MessageSquare,
  Pencil,
  Trash2,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useWorkspace, type ActivityEvent } from "@/state/workspace";

const KIND_ICONS: Record<ActivityEvent["kind"], LucideIcon> = {
  create: FilePlus2,
  insert: FilePlus2,
  update: Pencil,
  delete: Trash2,
  comment: MessageSquare,
  resolve: CheckCircle2,
  view: Eye,
  export: CheckCircle2,
};

const KIND_LABELS: Record<ActivityEvent["kind"], string> = {
  create: "created",
  insert: "inserted",
  update: "edited",
  delete: "deleted",
  comment: "commented",
  resolve: "resolved",
  view: "switched view",
  export: "exported",
};

function ToastCard({ event }: { event: ActivityEvent }) {
  const dismiss = useWorkspace((state) => state.dismissActivity);
  const undo = useWorkspace((state) => state.undo);
  const focusBlock = useWorkspace((state) => state.focusBlock);
  const Icon = KIND_ICONS[event.kind];

  useEffect(() => {
    const timer = setTimeout(() => dismiss(event.id), 5000);
    return () => clearTimeout(timer);
  }, [event.id, dismiss]);

  return (
    <div
      role="status"
      className="animate-toast-in pointer-events-auto flex w-[360px] max-w-[calc(100vw-32px)] items-center gap-2.5 rounded-card border border-line bg-card px-3 py-2 shadow-raised"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-bronze-soft text-bronze">
        <Icon size={13} />
      </span>
      <p className="min-w-0 flex-1 truncate text-[12.5px] leading-snug text-ink">
        <span className="mr-1.5 text-[10px] font-bold tracking-[0.07em] text-bronze uppercase">Agent</span>
        <span className="text-ink-faint">{KIND_LABELS[event.kind]} ·</span> {event.message}
      </p>
      {event.undoable ? (
        <button
          type="button"
          onClick={() => {
            undo();
            dismiss(event.id);
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-inset px-1.5 py-0.5 text-[11px] font-semibold text-ink-soft transition-colors hover:text-bronze"
        >
          <Undo2 size={11} />
          Undo
        </button>
      ) : null}
      {event.blockIds && event.blockIds.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            focusBlock(event.blockIds![0]);
            dismiss(event.id);
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-inset px-1.5 py-0.5 text-[11px] font-semibold text-ink-soft transition-colors hover:text-bronze"
        >
          <Eye size={11} />
          Show
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismiss(event.id)}
        className="shrink-0 rounded-[6px] p-1 text-ink-faint transition-colors hover:text-ink"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function ActivityToasts() {
  const activity = useWorkspace((state) => state.activity);
  if (activity.length === 0) return null;
  return (
    <div
      className="no-print pointer-events-none fixed right-4 bottom-9 z-[60] flex flex-col-reverse gap-2"
      aria-live="polite"
    >
      {activity.slice(-2).map((event) => (
        <ToastCard key={event.id} event={event} />
      ))}
    </div>
  );
}
