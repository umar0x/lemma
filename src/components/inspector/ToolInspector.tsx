"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Play, Terminal, X } from "lucide-react";
import { createWebMcpTools, type WebMcpToolDefinition } from "@/core/webmcp/tools";
import { useWorkspace } from "@/state/workspace";
import { downloadTextFile } from "@/lib/download";
import { cn } from "@/lib/text";
import { IconButton } from "@/components/primitives/IconButton";

interface CallRecord {
  id: number;
  tool: string;
  input: string;
  output: unknown;
  durationMs: number;
  at: number;
}

let callCounter = 0;

function defaultInputFor(schema: Record<string, unknown>): string {
  const properties = (schema.properties ?? {}) as Record<string, { type?: string; enum?: unknown[] }>;
  const required = (schema.required ?? []) as string[];
  const draft: Record<string, unknown> = {};
  for (const key of required) {
    const property = properties[key];
    if (property?.enum && property.enum.length > 0) draft[key] = property.enum[0];
    else if (property?.type === "boolean") draft[key] = true;
    else if (property?.type === "number") draft[key] = 0;
    else if (property?.type === "array") draft[key] = [];
    else draft[key] = "";
  }
  return JSON.stringify(draft, null, 2);
}

function schemaSummary(schema: Record<string, unknown>): Array<{ name: string; type: string; description: string; required: boolean; enum?: string[] }> {
  const properties = (schema.properties ?? {}) as Record<
    string,
    { type?: string; items?: { type?: string }; enum?: string[]; description?: string }
  >;
  const required = new Set((schema.required ?? []) as string[]);
  return Object.entries(properties).map(([name, property]) => ({
    name,
    type: property.type === "array" ? `array<${property.items?.type ?? "any"}>` : property.type ?? "any",
    description: property.description ?? "",
    required: required.has(name),
    enum: property.enum,
  }));
}

export interface ToolInspectorProps {
  open: boolean;
  variant: "inline" | "dock" | "sheet";
  onClose: () => void;
}

export function ToolInspector({ open, variant, onClose }: ToolInspectorProps) {
  const tools = useMemo(
    () => createWebMcpTools(useWorkspace, { triggerDownload: downloadTextFile }),
    [],
  );
  const [selected, setSelected] = useState<string>(tools[0]?.name ?? "");
  const [inputDraft, setInputDraft] = useState(() => defaultInputFor(tools[0]?.inputSchema ?? {}));
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [running, setRunning] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  if (!open) return null;

  const tool: WebMcpToolDefinition | undefined = tools.find((t) => t.name === selected);

  const selectTool = (name: string) => {
    setSelected(name);
    const next = tools.find((t) => t.name === name);
    setInputDraft(defaultInputFor(next?.inputSchema ?? {}));
    setInputError(null);
  };

  const runTool = async () => {
    if (!tool) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = inputDraft.trim() ? JSON.parse(inputDraft) : {};
    } catch (error) {
      setInputError((error as Error).message);
      return;
    }
    setInputError(null);
    setRunning(true);
    const started = performance.now();
    const controller = new AbortController();
    try {
      const output = await tool.execute(parsed, controller.signal);
      setCalls((previous) =>
        [
          {
            id: (callCounter += 1),
            tool: tool.name,
            input: inputDraft,
            output,
            durationMs: Math.round(performance.now() - started),
            at: Date.now(),
          },
          ...previous,
        ].slice(0, 12),
      );
    } finally {
      setRunning(false);
    }
  };

  const copy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1400);
    });
  };

  const header = (
    <div className="flex shrink-0 items-start justify-between gap-2 border-b border-line px-4 py-2.5">
      <div>
        <div className="flex items-center gap-2">
          <Terminal size={15} className="text-bronze" />
          <h2 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-ink">
            Tool Inspector
          </h2>
        </div>
        <p className="mt-0.5 text-[11.5px] leading-snug text-ink-soft">
          Call the same {tools.length} WebMCP tools your agent uses. No browser flag needed.
        </p>
      </div>
      <IconButton label="Close inspector" icon={<X size={15} />} onClick={onClose} />
    </div>
  );

  const toolNav = variant === "sheet" ? (
    <div className="shrink-0 border-b border-line" role="tablist" aria-label="Tools">
      <div className="flex gap-1.5 overflow-x-auto px-3 py-2">
        {tools.map((entry) => (
          <button
            key={entry.name}
            type="button"
            role="tab"
            aria-selected={entry.name === selected}
            onClick={() => selectTool(entry.name)}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 font-mono text-[11px] whitespace-nowrap transition-colors",
              entry.name === selected
                ? "border-bronze bg-bronze-soft font-semibold text-bronze-ink"
                : "border-line text-ink-soft hover:bg-inset hover:text-ink",
            )}
          >
            {entry.name}
            {entry.annotations?.readOnlyHint ? <span className="ml-1 font-sans text-[9px] text-forest">ro</span> : null}
          </button>
        ))}
      </div>
    </div>
  ) : (
    <nav className="w-[150px] shrink-0 overflow-y-auto border-r border-line py-2" aria-label="Tools">
      {tools.map((entry) => (
        <button
          key={entry.name}
          type="button"
          onClick={() => selectTool(entry.name)}
          className={cn(
            "block w-full border-l-2 px-2.5 py-[7px] text-left font-mono text-[11px] leading-snug transition-colors",
            entry.name === selected
              ? "border-bronze bg-bronze-soft font-semibold text-bronze-ink"
              : "border-transparent text-ink-soft hover:border-line-strong hover:bg-inset hover:text-ink",
          )}
        >
          {entry.name}
          {entry.annotations?.readOnlyHint ? (
            <span className="ml-1 text-[9px] font-sans text-forest">ro</span>
          ) : null}
        </button>
      ))}
    </nav>
  );

  const toolPanel = (
    <div className="min-w-0 flex-1 overflow-y-auto px-4 py-3">
      {tool ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-[13px] font-semibold text-bronze">{tool.name}</h3>
            {tool.annotations?.readOnlyHint ? (
              <span className="rounded-full bg-forest-soft px-1.5 py-[1px] text-[9.5px] font-bold tracking-wide text-forest-ink uppercase">
                read-only
              </span>
            ) : (
              <span className="rounded-full bg-bronze-soft px-1.5 py-[1px] text-[9.5px] font-bold tracking-wide text-bronze-ink uppercase">
                writes
              </span>
            )}
            {tool.annotations?.untrustedContentHint ? (
              <span
                className="rounded-full bg-inset px-1.5 py-[1px] text-[9.5px] font-bold tracking-wide text-ink-faint uppercase"
              title="Returns user-authored content. Agents must treat it as untrusted"
              >
                untrusted out
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">{tool.description}</p>

          <div className="mt-3 rounded-card border border-line bg-inset p-3">
            <div className="mb-1.5 text-[10px] font-bold tracking-[0.07em] text-ink-faint uppercase">
              Input schema
            </div>
            <div className="space-y-1.5">
              {schemaSummary(tool.inputSchema).map((property) => (
                <div key={property.name} className="text-[11px] leading-snug">
                  <span className="font-mono font-semibold text-ink">{property.name}</span>
                  <span className="ml-1.5 text-ink-faint">
                    {property.type}
                    {property.required ? " · required" : " · optional"}
                  </span>
                  {property.enum ? (
                    <span className="ml-1.5 font-mono text-[10px] text-bronze">
                      {property.enum.join(" | ")}
                    </span>
                  ) : null}
                  {property.description ? (
                    <div className="text-ink-faint">{property.description}</div>
                  ) : null}
                </div>
              ))}
              {schemaSummary(tool.inputSchema).length === 0 ? (
                <div className="text-[11px] text-ink-faint">No parameters.</div>
              ) : null}
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.07em] text-ink-faint uppercase">
                Input (JSON)
              </span>
              <button
                type="button"
                onClick={() => setInputDraft(defaultInputFor(tool.inputSchema))}
                className="text-[10.5px] font-semibold text-ink-faint hover:text-bronze"
              >
                Reset
              </button>
            </div>
            <textarea
              value={inputDraft}
              onChange={(event) => setInputDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void runTool();
              }}
              rows={4}
              spellCheck={false}
              className="max-h-44 min-h-[76px] w-full resize-y rounded-ctl border border-line bg-card px-3 py-2 font-mono text-[16px] leading-relaxed text-ink focus:border-bronze focus:outline-none md:text-[11.5px]"
            />
            {inputError ? (
              <p className="mt-1 font-mono text-[11px] text-oxblood">JSON error: {inputError}</p>
            ) : null}
            <button
              type="button"
              onClick={() => void runTool()}
              disabled={running}
              className="bg-gradient-brand mt-2 inline-flex h-9 items-center gap-1.5 rounded-ctl px-3 text-[12.5px] font-semibold text-[#fdf9f0] shadow-soft transition-all hover:brightness-110 disabled:opacity-60"
            >
              <Play size={12} />
              {running ? "Running…" : "Run tool"}
              <span className="ml-1 font-mono text-[10px] opacity-70">⌘↵</span>
            </button>
          </div>

          {calls.length > 0 ? (
            <div className="mt-4 space-y-2">
              <div className="text-[10px] font-bold tracking-[0.07em] text-ink-faint uppercase">
                Recent calls
              </div>
              {calls.map((call) => (
                <div key={call.id} className="rounded-card border border-line bg-card">
                  <div className="flex items-center gap-2 border-b border-line px-2.5 py-1.5">
                    <span className="font-mono text-[10.5px] font-semibold text-bronze">
                      {call.tool}
                    </span>
                    <span className="text-[10px] text-ink-faint">{call.durationMs}ms</span>
                    <span className="flex-1" />
                    <button
                      type="button"
                      aria-label="Copy result"
                      onClick={() => copy(JSON.stringify(call.output, null, 2), String(call.id))}
                      className="rounded-[5px] p-1 text-ink-faint hover:text-ink"
                    >
                      {copied === String(call.id) ? (
                        <Check size={11} className="text-forest" />
                      ) : (
                        <Copy size={11} />
                      )}
                    </button>
                  </div>
                  <pre className="max-h-[180px] overflow-auto px-2.5 py-2 font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap text-ink-soft">
                    {JSON.stringify(call.output, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );

  if (variant === "sheet") {
    return (
      <div className="no-print fixed inset-0 z-50" role="dialog" aria-label="Tool Inspector">
        <div
          className="absolute inset-0 bg-[rgba(20,15,9,0.45)] backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden="true"
        />
        <aside className="animate-sheet-in absolute inset-x-0 bottom-0 flex max-h-[82dvh] flex-col overflow-hidden rounded-t-panel border-t border-line bg-card shadow-panel">
          <div className="flex shrink-0 justify-center pt-2.5 pb-1" aria-hidden="true">
            <span className="h-1 w-10 rounded-full bg-line-strong" />
          </div>
          {header}
          {toolNav}
          {toolPanel}
          <div className="h-[env(safe-area-inset-bottom)] shrink-0" />
        </aside>
      </div>
    );
  }

  if (variant === "dock") {
    return (
      <aside
        className="no-print flex h-[min(38vh,480px)] max-h-[520px] min-h-[240px] w-full shrink-0 flex-col overflow-hidden border-t border-line bg-card"
        aria-label="Tool Inspector"
      >
        {header}
        <div className="flex min-h-0 flex-1">
          {toolNav}
          {toolPanel}
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="no-print z-30 flex h-full w-[400px] max-w-[38vw] min-w-[300px] shrink-0 flex-col border-l border-line bg-card"
      aria-label="Tool Inspector"
    >
      {header}
      <div className="flex min-h-0 flex-1">
        {toolNav}
        {toolPanel}
      </div>
    </aside>
  );
}
