# Lemma

A collaborative live-LaTeX workspace where users and agents create and edit documents together.

Lemma is a WebMCP-native, local-first LaTeX editor. You write LaTeX in the source pane, KaTeX renders it live in the preview, and an agent inside a WebMCP-capable browser reads the same document through registered tools, edits individual blocks by stable ID, and watches its own render errors come back as structured tool output. The whole loop closes inside the tab. No copy-paste round trips, no server round trips, no stale snapshots.

Powered by [WebMCP](https://openai.com/webmcp-challenge/).

> This is a submission for [The WebMCP Challenge](https://openai.com/webmcp-challenge/).

---

## What it does

- Live LaTeX rendering via KaTeX with equation numbering, cross-references, theorem environments, mhchem, macros, tables, and a substantial TikZ subset.
- Block-anchored editing. Every equation, theorem, paragraph, and figure has a stable ID. The agent edits by ID, never by quote matching. When you hand-edit the raw source, a reconciliation pass preserves existing IDs so agent comments stay anchored to the right paragraph even as text shifts.
- Self-correcting render loop. KaTeX errors surface as structured tool output with block ID, character position, context, and a suggested fix. The agent reads the error and edits the block in one round trip.
- Local-first. Documents live in IndexedDB inside the tab. No backend, no account, no telemetry.
- Responsive. Split source/preview on desktop, bottom-sheet Tool Inspector and a LaTeX key bar on mobile, paginated print and PDF output with real page numbers.

## Install

Requires Node 18+ (or Bun 1.1+) and a WebMCP-capable browser for the agent loop.

```bash
git clone https://github.com/<you>/lemma.git
cd lemma
npm install         # or: bun install
```

## Start

```bash
npm run dev         # or: bun run dev
```

Open http://localhost:3000 in a WebMCP-capable browser. The dev server sets `Origin-Agent-Cluster: ?1` and the full security-header stack so registration works locally the same way it does deployed.

For a production build:

```bash
npm run build       # static export to ./out
npm run start       # serve the export locally
```

## Agents that can call Lemma's tools

WebMCP tools live in the browser tab and are discovered by agents that drive a WebMCP-capable browser. The page cannot push tools into an agent session; the agent must bridge to the tab.

| Agent | Tools usable | Notes |
|-------|--------------|-------|
| ChatGPT desktop app, in-app Browser (Sol or Terra models) | yes | Pick Site tools in the address bar to inspect them. |
| Chrome 149+ with `chrome://flags/#enable-webmcp-testing` | yes, including declarative form tools | Watch calls live in DevTools, Application, WebMCP. |
| Any browser, no flags | yes, via the in-app Tool Inspector | Same registered tools, same code path, wrapped in UI. |

## The tools

Fifteen imperative tools via `document.modelContext.registerTool`, plus one declarative form tool.

**Read**

| Tool | Purpose |
|------|---------|
| `list_documents` | Documents with block counts, error counts, snippets. |
| `get_document` | Full block structure: IDs, LaTeX, render status, labels, comments. |
| `get_document_outline` | Lightweight TOC: headings, numbered theorems, labeled equations. |
| `search_documents` | Workspace-wide search returning block IDs with neighbor context. |
| `get_render_errors` | Live KaTeX errors with block ID, position, context, suggested fix. |

**Write**

| Tool | Purpose |
|------|---------|
| `create_document` | From template: blank, notes, problem_set, exam, paper_section. |
| `insert_blocks` | Insert after any anchor block; returns each block's render status. |
| `update_block` | Replace or append to one block by ID. |
| `delete_block` | Remove one block and its comment threads. |
| `undo_last_change` | Reverts the agent's own last edit; refuses to revert user typing. |
| `add_comment` | Margin thread anchored to a block, badged as agent-authored. |
| `reply_to_comment` | Reply in-thread. |
| `resolve_comment` | Close or reopen a thread. |
| `set_view` | Switch source, split, preview and scroll to a block. |
| `export_document` | Download a compilable `.tex`. |

**Declarative**: the sidebar search form carries `toolname="filter_documents"` with `toolautosubmit` so a Chrome-native agent can drive the visible UI filter and receive matches via `respondWith`.

## How to use

1. Open the deployed URL in a WebMCP-capable browser, or run `npm run dev` locally.
2. The seed document has one deliberate typo (`\alpa` instead of `\alpha`) so you can watch the loop end to end.
3. Ask your agent: "What render errors are in the demo document?" It will call `get_render_errors` and report the typo with block ID, position, and a suggested fix.
4. Ask: "Fix the render errors." It will call `update_block`, the math will re-render, and the block will glow.
5. Ask: "Add a numbered equation for the product rule, label it, and reference it from a new paragraph." Equation tags and `\eqref` resolve live.
6. Open the Tool Inspector (terminal icon in the toolbar) to call any tool yourself, no agent required. Same code path, wrapped in UI.

## Architecture

```
src/
  core/                    framework-free domain logic, fully unit-tested
    blocks/                types, LaTeX parser, ID reconciliation, .tex serializer
    latex/                 KaTeX engine, error extraction, render cache, TikZ, geometry
    templates/             five document templates and the seeded demo
    storage/               typed IndexedDB wrapper with sanitization on read
    webmcp/                15 tool definitions and registration lifecycle
  state/workspace.ts       Zustand store: documents, author-aware undo/redo, activity
  components/              shell, editor, preview, print, inspector
  types/webmcp.d.ts        spec-accurate WebMCP IDL typings
```

- Stack: Next.js 16 (static export), React 19, TypeScript strict, Tailwind CSS 4, CodeMirror 6, KaTeX with mhchem, Zustand, IndexedDB.
- Typography: Fraunces (display), Newsreader (reading), Inter (UI), JetBrains Mono (source).
- Security: strict CSP, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` including `tools=(self)`, `Cross-Origin-Opener-Policy: same-origin`, and `Origin-Agent-Cluster: ?1` for the origin isolation WebMCP requires. All rendered HTML is escaped or KaTeX-generated with `trust: false`; URLs are protocol-whitelisted; colors are whitelisted; IndexedDB records are sanitized on read.

## Tests

```bash
npm test            # 223 unit tests across blocks, latex, storage, webmcp, state, templates
npm run typecheck   # strict TypeScript
npm run lint        # ESLint (next/core-web-vitals + typescript)
```

## Deploy

Static export, deployable to any static host. The included platform configs emit the WebMCP and security headers.

- **Netlify**: `netlify.toml` with `publish = "out"` and the full header set.
- **Vercel**: `vercel.json`, headers applied automatically.
- **Cloudflare Pages**: build command `npm run build`, output directory `out`; `public/_headers` carries the same rules.
- **Any static host**: serve `out/` and copy the header rules from `public/_headers`.

## License

MIT
