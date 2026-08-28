import type { DocumentRecord } from "@/core/blocks/types";
import { serializeDocumentTex } from "@/core/blocks/serialize";
import { downloadTextFile } from "@/lib/download";

export function texFilename(title: string): string {
  return `${title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "document"}.tex`;
}

export function exportActiveTex(document: DocumentRecord): void {
  downloadTextFile(texFilename(document.title), serializeDocumentTex(document), "application/x-tex");
}
