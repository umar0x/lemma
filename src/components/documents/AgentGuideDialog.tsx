"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Sparkles } from "lucide-react";
import { useWorkspace } from "@/state/workspace";
import { Dialog } from "@/components/primitives/Dialog";

const EXAMPLE_PROMPTS = [
  "List my documents and fix any render errors in the demo document.",
  "Create a problem set called “Midterm review” with three integration problems.",
  "Insert a TikZ figure showing a right triangle with labeled vertices $A$, $B$, $C$ and the altitude from $C$.",
  "Read the demo document and comment on the theorem explaining it in plain words.",
  "Insert an align block deriving the derivative of $x \\ln x$, then switch me to preview and scroll to it.",
  "Export the demo document as a .tex file and show me the source.",
];

function CopyRow({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="group flex w-full items-center gap-2.5 rounded-ctl border border-line bg-card px-3 py-2.5 text-left transition-all hover:border-line-strong hover:bg-inset"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
    >
      <span className="min-w-0 flex-1 font-mono text-[11.5px] leading-snug text-ink-soft">{text}</span>
      {copied ? (
        <Check size={13} className="shrink-0 text-forest" />
      ) : (
        <Copy size={13} className="shrink-0 text-ink-faint group-hover:text-ink-soft" />
      )}
    </button>
  );
}

export interface AgentGuideDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AgentGuideDialog({ open, onClose }: AgentGuideDialogProps) {
  const webmcpStatus = useWorkspace((state) => state.webmcpStatus);
  const registeredTools = useWorkspace((state) => state.registeredTools);
  const active = webmcpStatus === "ready";

  return (
    <Dialog open={open} onClose={onClose} title="Connect your agent" width="600px">
      <div
        className={
          active
            ? "flex items-start gap-3 rounded-card border border-[color-mix(in_srgb,var(--forest)_30%,transparent)] bg-forest-soft p-3.5"
            : "flex items-start gap-3 rounded-card border border-[color-mix(in_srgb,var(--gold)_35%,transparent)] bg-bronze-soft p-3.5"
        }
      >
        <Sparkles size={16} className={active ? "mt-0.5 shrink-0 text-forest" : "mt-0.5 shrink-0 text-gold"} />
        <div className="text-[12.5px] leading-relaxed">
          {active ? (
            <p className="text-forest-ink">
              <strong className="font-semibold">WebMCP is live.</strong> {registeredTools.length} tools are
              registered on this tab and ready for any agent browsing this page.
            </p>
          ) : (
            <p className="text-bronze-ink">
              <strong className="font-semibold">WebMCP is not detected in this browser.</strong> The app
              works fully without it, and the Tool Inspector (toolbar{" "}
              <span className="font-mono text-[11px]">Terminal</span> icon) lets you call every tool by
              hand. To connect a real agent, use either option below.
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <section>
          <h3 className="text-[12px] font-bold tracking-[0.06em] text-ink-faint uppercase">Option A · ChatGPT</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
            Open Lemma in <strong className="font-semibold text-ink">ChatGPT&apos;s in-app browser</strong> and ask
            your agent to work on the document. WebMCP is supported there out of the box.
          </p>
        </section>

        <section>
          <h3 className="text-[12px] font-bold tracking-[0.06em] text-ink-faint uppercase">Option B · Google Chrome</h3>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-ink-soft">
            <li>
              Use Chrome 149 or newer and enable{" "}
              <code className="rounded-[5px] bg-inset px-1.5 py-0.5 font-mono text-[11.5px] text-bronze">
                chrome://flags/#enable-webmcp-testing
              </code>
            </li>
            <li>Relaunch the browser and open Lemma.</li>
            <li>Open Chrome DevTools → Application → WebMCP to watch every tool call live.</li>
          </ol>
        </section>

        <section>
          <h3 className="text-[12px] font-bold tracking-[0.06em] text-ink-faint uppercase">Try these prompts</h3>
          <div className="mt-2 space-y-1.5">
            {EXAMPLE_PROMPTS.map((prompt) => (
              <CopyRow key={prompt} text={prompt} />
            ))}
          </div>
        </section>

        <section className="rounded-card border border-line bg-inset p-3.5">
          <h3 className="text-[12px] font-bold tracking-[0.06em] text-ink-faint uppercase">What agents can do here</h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
            Sixteen tools cover reading (<span className="font-mono text-[11px] text-bronze">list_documents</span>,{" "}
            <span className="font-mono text-[11px] text-bronze">get_document</span>,{" "}
            <span className="font-mono text-[11px] text-bronze">search_documents</span>), surgical block
            editing (including TikZ figures in <span className="font-mono text-[11px] text-bronze">figure</span>{" "}
            blocks), margin comments, view control, and .tex export. Render errors are returned as
            structured tool output, so agents can find and fix their own LaTeX mistakes without
            copy-paste ping-pong.
          </p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
            The engine also honors the{" "}
            <span className="font-mono text-[11px] text-bronze">geometry</span> and{" "}
            <span className="font-mono text-[11px] text-bronze">microtype</span> packages from your preamble.
            Page setup drives the print/PDF export, and microtype refines preview typography.
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-faint">
            <ExternalLink size={11} />
            Everything stays in this tab. Lemma is local-first and has no backend.
          </p>
        </section>
      </div>
    </Dialog>
  );
}
