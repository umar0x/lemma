import type { ModelContext, ModelContextTool } from "@/types/webmcp";
import type { WebMcpToolDefinition } from "./tools";

export interface RegistrationResult {
  status: "unavailable" | "registering" | "ready" | "error";
  registered: string[];
  failed: Array<{ name: string; reason: string }>;
  teardown: () => void;
}

export function isWebMcpAvailable(): boolean {
  return typeof document !== "undefined" && "modelContext" in document;
}

export function toModelContextTool(tool: WebMcpToolDefinition): ModelContextTool {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
    execute: (input, options) => {
      let parsed: Record<string, unknown> = {};
      if (typeof input === "string") {
        try {
          parsed = input.trim() ? (JSON.parse(input) as Record<string, unknown>) : {};
        } catch {
          return { error: `Invalid JSON input: ${input.slice(0, 120)}` };
        }
      } else if (input && typeof input === "object") {
        parsed = input as Record<string, unknown>;
      }
      const signal = options?.signal ?? new AbortController().signal;
      return tool.execute(parsed, signal);
    },
  };
}

export async function registerWebMcpTools(
  modelContext: ModelContext,
  tools: WebMcpToolDefinition[],
): Promise<RegistrationResult> {
  const controller = new AbortController();
  const registered: string[] = [];
  const failed: Array<{ name: string; reason: string }> = [];

  for (const tool of tools) {
    try {
      await modelContext.registerTool(toModelContextTool(tool), { signal: controller.signal });
      registered.push(tool.name);
    } catch (error) {
      failed.push({
        name: tool.name,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    status: failed.length > 0 && registered.length === 0 ? "error" : "ready",
    registered,
    failed,
    teardown: () => controller.abort(),
  };
}
