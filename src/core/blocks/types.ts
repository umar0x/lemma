export type BlockType =
  | "text"
  | "equation"
  | "align"
  | "theorem"
  | "figure"
  | "table"
  | "code"
  | "preamble";

export type Author = "user" | "agent";

export interface ParsedSegment {
  type: BlockType;
  latex: string;
}

export interface Block {
  id: string;
  type: BlockType;
  latex: string;
  lastEditedBy: Author;
  lastEditedAt: number;
}

export interface CommentEntry {
  id: string;
  author: Author;
  text: string;
  createdAt: number;
}

export interface CommentThread {
  id: string;
  blockId: string;
  quote?: string;
  resolved: boolean;
  resolvedAt?: number;
  comments: CommentEntry[];
}

export interface DocumentRecord {
  id: string;
  title: string;
  blocks: Block[];
  threads: CommentThread[];
  createdAt: number;
  updatedAt: number;
}
