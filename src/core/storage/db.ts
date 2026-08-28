import type { Block, BlockType, DocumentRecord } from "@/core/blocks/types";

const DB_NAME = "lemma";
const DB_VERSION = 1;
const DOCUMENTS_STORE = "documents";
const META_STORE = "meta";

const VALID_BLOCK_TYPES: ReadonlySet<string> = new Set([
  "text",
  "equation",
  "align",
  "theorem",
  "figure",
  "table",
  "code",
  "preamble",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeBlock(value: unknown): Block | null {
  if (!isPlainObject(value)) return null;
  const type = typeof value.type === "string" && VALID_BLOCK_TYPES.has(value.type) ? value.type : "text";
  if (typeof value.id !== "string" || value.id.length === 0 || value.id.length > 64) return null;
  if (typeof value.latex !== "string" || value.latex.length > 200_000) return null;
  const lastEditedBy = value.lastEditedBy === "agent" ? "agent" : "user";
  return {
    id: value.id,
    type: type as BlockType,
    latex: value.latex,
    lastEditedBy,
    lastEditedAt: typeof value.lastEditedAt === "number" ? value.lastEditedAt : 0,
  };
}

export function sanitizeDocumentRecord(value: unknown): DocumentRecord | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.id !== "string" || value.id.length === 0 || value.id.length > 64) return null;
  if (typeof value.title !== "string" || value.title.length > 300) return null;
  if (!Array.isArray(value.blocks) || !Array.isArray(value.threads)) return null;
  if (value.blocks.length > 5_000) return null;
  const blocks = value.blocks
    .map(sanitizeBlock)
    .filter((block): block is Block => block !== null);
  const threads = value.threads.filter(
    (thread): boolean =>
      isPlainObject(thread) &&
      typeof thread.id === "string" &&
      typeof thread.blockId === "string" &&
      typeof thread.resolved === "boolean" &&
      Array.isArray(thread.comments) &&
      thread.comments.every(
        (comment) =>
          isPlainObject(comment) &&
          typeof comment.id === "string" &&
          typeof comment.text === "string" &&
          (comment.author === "user" || comment.author === "agent"),
      ),
  );
  return {
    id: value.id,
    title: value.title,
    blocks,
    threads,
    createdAt: typeof value.createdAt === "number" ? value.createdAt : Date.now(),
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
  };
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDatabase(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DOCUMENTS_STORE)) {
          db.createObjectStore(DOCUMENTS_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error ?? new Error("Failed to open IndexedDB"));
      };
    });
  }
  return dbPromise;
}

if (typeof window !== "undefined" && typeof indexedDB !== "undefined") {
  void openDatabase().catch(() => undefined);
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export const documentRepository = {
  async list(): Promise<DocumentRecord[]> {
    const db = await openDatabase();
    const tx = db.transaction(DOCUMENTS_STORE, "readonly");
    const request = tx.objectStore(DOCUMENTS_STORE).getAll();
    const documents = await requestToPromise(request);
    return documents
      .map(sanitizeDocumentRecord)
      .filter((doc): doc is DocumentRecord => doc !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async get(id: string): Promise<DocumentRecord | undefined> {
    const db = await openDatabase();
    const tx = db.transaction(DOCUMENTS_STORE, "readonly");
    const raw = await requestToPromise(tx.objectStore(DOCUMENTS_STORE).get(id));
    return raw === undefined ? undefined : (sanitizeDocumentRecord(raw) ?? undefined);
  },

  async put(document: DocumentRecord): Promise<void> {
    const db = await openDatabase();
    const tx = db.transaction(DOCUMENTS_STORE, "readwrite");
    await requestToPromise(tx.objectStore(DOCUMENTS_STORE).put(document));
  },

  async remove(id: string): Promise<void> {
    const db = await openDatabase();
    const tx = db.transaction(DOCUMENTS_STORE, "readwrite");
    await requestToPromise(tx.objectStore(DOCUMENTS_STORE).delete(id));
  },
};

export const metaRepository = {
  async get<T>(key: string): Promise<T | undefined> {
    const db = await openDatabase();
    const tx = db.transaction(META_STORE, "readonly");
    return requestToPromise(tx.objectStore(META_STORE).get(key)) as Promise<T | undefined>;
  },

  async set<T>(key: string, value: T): Promise<void> {
    const db = await openDatabase();
    const tx = db.transaction(META_STORE, "readwrite");
    await requestToPromise(tx.objectStore(META_STORE).put(value, key));
  },
};
