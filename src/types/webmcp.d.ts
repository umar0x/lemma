export interface ToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}

export interface ToolExecuteCallbackOptions {
  signal: AbortSignal;
}

export interface ModelContextTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (
    input: unknown,
    options: ToolExecuteCallbackOptions,
  ) => Promise<unknown> | unknown;
  annotations?: ToolAnnotations;
}

export interface ModelContextRegisterToolOptions {
  exposedTo?: string[];
  signal?: AbortSignal;
}

export interface RegisteredTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  window: Window;
  origin: string;
  annotations?: ToolAnnotations;
}

export interface ModelContextGetToolOptions {
  fromOrigins?: string[];
}

export interface ModelContextExecuteToolOptions {
  signal?: AbortSignal;
}

export interface ModelContext extends EventTarget {
  registerTool(
    tool: ModelContextTool,
    options?: ModelContextRegisterToolOptions,
  ): Promise<void>;
  getTools(options?: ModelContextGetToolOptions): Promise<RegisteredTool[]>;
  executeTool(
    tool: RegisteredTool,
    inputObject?: object,
    options?: ModelContextExecuteToolOptions,
  ): Promise<string>;
  addEventListener(
    type: "toolchange",
    listener: (event: Event) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: "toolchange",
    listener: (event: Event) => void,
    options?: boolean | EventListenerOptions,
  ): void;
}

declare global {
  interface Document {
    readonly modelContext?: ModelContext;
  }

  interface SubmitEvent {
    readonly agentInvoked?: boolean;
    respondWith?(response: Promise<unknown>): void;
  }

  interface Window {
    addEventListener(
      type: "toolactivated",
      listener: (event: ToolWindowEvent) => void,
      options?: boolean | AddEventListenerOptions,
    ): void;
    addEventListener(
      type: "toolcancel",
      listener: (event: ToolWindowEvent) => void,
      options?: boolean | AddEventListenerOptions,
    ): void;
  }
}

export interface ToolWindowEvent extends Event {
  readonly toolName: string;
}
