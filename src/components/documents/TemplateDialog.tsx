"use client";

import { useCallback, useState } from "react";
import posthog from "posthog-js";
import { BookOpen, FileText, FlaskConical, GraduationCap, ListChecks, ScrollText } from "lucide-react";
import { listTemplates, type TemplateId } from "@/core/templates";
import { useWorkspace } from "@/state/workspace";
import { cn } from "@/lib/text";
import { Dialog } from "@/components/primitives/Dialog";
import { Button } from "@/components/primitives/Button";

const TEMPLATE_ICONS: Record<TemplateId, typeof FileText> = {
  blank: FileText,
  notes: BookOpen,
  problem_set: ListChecks,
  exam: GraduationCap,
  paper_section: ScrollText,
  demo: FlaskConical,
};

export interface TemplateDialogProps {
  open: boolean;
  onClose: () => void;
}

const DEFAULT_TEMPLATE: TemplateId = "notes";

function getDefaultTitle(id: TemplateId): string {
  if (id === "blank") return "Untitled";
  const def = listTemplates().find((t) => t.id === id);
  return def?.name ?? "Untitled";
}

export function TemplateDialog({ open, onClose }: TemplateDialogProps) {
  const createDocument = useWorkspace((state) => state.createDocument);
  const [title, setTitle] = useState(() => getDefaultTitle(DEFAULT_TEMPLATE));
  const [template, setTemplate] = useState<TemplateId>(DEFAULT_TEMPLATE);
  const [titleEdited, setTitleEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectTemplate = useCallback(
    (id: TemplateId) => {
      setTemplate(id);
      if (!titleEdited) {
        setTitle(getDefaultTitle(id));
      }
    },
    [titleEdited],
  );

  const handleCreate = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Give the document a title first.");
      return;
    }
    createDocument(template, trimmed);
    posthog.capture("document_created", { template });
    setTitle(getDefaultTitle(DEFAULT_TEMPLATE));
    setTemplate(DEFAULT_TEMPLATE);
    setTitleEdited(false);
    setError(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New document"
      description="Pick a template to start from. Your agent can reshape everything later."
      width="620px"
    >
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.06em] text-ink-faint uppercase">
          Title
        </span>
        <input
          autoFocus
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setTitleEdited(true);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleCreate();
            }
          }}
          placeholder="e.g. Midterm 2 review"
          className="h-10 w-full rounded-ctl border border-line bg-inset px-3 text-[14px] text-ink placeholder:text-ink-faint focus:border-bronze focus:bg-card focus:outline-none"
        />
      </label>
      {error ? <p className="mt-1.5 text-[12px] text-oxblood">{error}</p> : null}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {listTemplates().map((definition) => {
          const Icon = TEMPLATE_ICONS[definition.id];
          const selected = template === definition.id;
          return (
            <button
              key={definition.id}
              type="button"
              onClick={() => handleSelectTemplate(definition.id)}
              aria-pressed={selected}
              className={cn(
                "flex items-start gap-3 rounded-card border p-3 text-left transition-all duration-150",
                selected
                  ? "border-[color-mix(in_srgb,var(--bronze)_45%,transparent)] bg-bronze-soft shadow-soft"
                  : "border-line bg-card hover:border-line-strong hover:bg-inset",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-ctl border",
                  selected
                    ? "border-[color-mix(in_srgb,var(--bronze)_30%,transparent)] bg-card text-bronze"
                    : "border-line bg-inset text-ink-soft",
                )}
              >
                <Icon size={15} />
              </span>
              <span className="min-w-0">
                <span className={cn("block text-[13.5px] font-semibold", selected ? "text-bronze-ink" : "text-ink")}>
                  {definition.name}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-soft">
                  {definition.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleCreate}>
          Create document
        </Button>
      </div>
    </Dialog>
  );
}
