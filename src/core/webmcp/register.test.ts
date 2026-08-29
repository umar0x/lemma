import { describe, expect, it, vi } from "vitest";
import type { ModelContext, ModelContextTool } from "@/types/webmcp";
import { createWebMcpTools, WEBMCP_TOOL_NAMES } from "./tools";
import { isWebMcpAvailable, registerWebMcpTools, toModelContextTool } from "./register";
import { useWorkspace } from "@/state/workspace";

function mockModelContext(options: { failOn?: string } = {}) {
  const registered: ModelContextTool[] = [];
  const listeners: Array<(event: Event) => void> = [];
  const context: ModelContext = {
    registerTool: vi.fn(async (tool: ModelContextTool) => {
      if (options.failOn === "*" || options.failOn === tool.name) {
        throw new DOMException("InvalidStateError", "InvalidStateError");
      }
      registered.push(tool);
      for (const listener of listeners) listener(new Event("toolchange"));
    }),
    getTools: vi.fn(async () =>
      registered.map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        window,
        origin: "https://lemma.test",
        annotations: tool.annotations,
      })),
    ),
    executeTool: vi.fn(),
    addEventListener: vi.fn((type: string, listener: (event: Event) => void) => {
      if (type === "toolchange") listeners.push(listener);
    }),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as ModelContext;
  return { context, registered };
}

describe("registerWebMcpTools", () => {
  it("registers all tools and reports ready", async () => {
    const { context, registered } = mockModelContext();
    const tools = createWebMcpTools(useWorkspace, { triggerDownload: () => {} });
    const result = await registerWebMcpTools(context, tools);
    expect(result.status).toBe("ready");
    expect(result.registered).toEqual([...WEBMCP_TOOL_NAMES]);
    expect(registered).toHaveLength(15);
  });

  it("converts definitions to model context tools with annotations", () => {
    const tools = createWebMcpTools(useWorkspace, { triggerDownload: () => {} });
    const converted = toModelContextTool(tools[0]);
    expect(converted.name).toBe(tools[0].name);
    expect(converted.title).toBe(tools[0].title);
    expect(converted.annotations?.readOnlyHint).toBe(true);
    expect(typeof converted.execute).toBe("function");
  });

  it("reports partial failures without failing the whole registration", async () => {
    const { context } = mockModelContext({ failOn: "update_block" });
    const tools = createWebMcpTools(useWorkspace, { triggerDownload: () => {} });
    const result = await registerWebMcpTools(context, tools);
    expect(result.status).toBe("ready");
    expect(result.registered).toHaveLength(14);
    expect(result.failed).toEqual([{ name: "update_block", reason: expect.any(String) }]);
  });

  it("reports error status when every registration fails", async () => {
    const { context } = mockModelContext({ failOn: "*" });
    const tools = createWebMcpTools(useWorkspace, { triggerDownload: () => {} });
    const result = await registerWebMcpTools(context, tools);
    expect(result.status).toBe("error");
    expect(result.registered).toHaveLength(0);
  });

  it("passes an abort signal that unregisters on teardown", async () => {
    const signals: AbortSignal[] = [];
    const context = {
      registerTool: vi.fn(async (_tool: ModelContextTool, options?: { signal?: AbortSignal }) => {
        if (options?.signal) signals.push(options.signal);
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as ModelContext;
    const tools = createWebMcpTools(useWorkspace, { triggerDownload: () => {} });
    const result = await registerWebMcpTools(context, tools);
    expect(signals).toHaveLength(15);
    result.teardown();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});

describe("isWebMcpAvailable", () => {
  it("detects availability based on document.modelContext", () => {
    const original = document.modelContext;
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, "modelContext");
    expect(isWebMcpAvailable()).toBe(false);
    Object.defineProperty(document, "modelContext", { value: {}, configurable: true });
    expect(isWebMcpAvailable()).toBe(true);
    if (descriptor) {
      Object.defineProperty(Document.prototype, "modelContext", descriptor);
    }
    delete (document as { modelContext?: unknown }).modelContext;
    expect(original).toBeUndefined();
  });
});
