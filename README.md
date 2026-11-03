# Notes

A small shared Markdown notebook inspired by Obsidian. Edit formatted notes directly, link them with `[[Note title]]`, search, import/export Markdown, and share the whole notebook using a view or edit link. This is a working application, with server-side persistence and automatic synchronization between browsers.

[Open the live example](https://nexa-notes-template.nexa-f33.workers.dev/)

The example is read-only until you choose **Create your notebook**. Every new notebook has separate storage and fresh access links. The example contains fictional notes; customer data is never part of this repository.

## Run and deploy

Requires Node.js 22 or later and a Cloudflare account supporting SQLite Durable Objects.

```sh
npm ci
npm run dev
# On your own Cloudflare account:
npx wrangler login
npm run deploy
```

Choose a unique `name` in `wrangler.jsonc` before deployment. The Worker and its `Notebook` Durable Object deploy together; no database IDs, external services, or secrets need to be copied. `npm run build` produces browser assets in `dist/`; a static-only deployment cannot save or share notes. Keep the Worker, binding, and SQLite class migration when adapting the template. The rate-limit namespace is scoped to the Cloudflare account; use a different namespace number if you need independent limits in another deployment.

For a Nexa project, import `https://github.com/nexaintel2/notes.git`, keep it as the upstream, and deploy a new Worker in the customer's connected account with its own Durable Object namespace. Build command: `npm run build`. Deploy command: `npx wrangler deploy`. Do not connect customer projects to the public example's API or storage.

## Editing

**Write** is the default for owners and editors. The Tiptap/ProseMirror editor supports headings, bold, italic, strikethrough, highlights, inline code, nested bullet and numbered lists, checklists, quotes, rules, tables, links, and syntax-highlighted code blocks. The toolbar follows the current selection. Click a checklist box to complete an item; select a table cell to add or remove rows and columns. Choose a code block's language from the toolbar.

Markdown shortcuts work as you type: `## ` starts a heading, `- ` starts a list, and `**text**` becomes bold. Type `[[` to choose a note with the arrow keys and Enter, or finish typing `[[Note title]]`. `[[Note title|Display text]]` is also supported. Click a note link to open it; Ctrl/Cmd-click opens an external link while editing. The link dialog can insert or edit links without typing Markdown.

Use **Markdown** to inspect or edit the raw source, and **Read** for a quiet, read-only view. Notes are still stored and exported as Markdown. Switching views without editing preserves the exact source; formatted edits normalize Markdown whitespace and delimiters. Unsupported constructs such as raw HTML, images, frontmatter, math, embeds, and plugin syntax open in source view so editing does not silently erase them. They are preserved on export; external images and unsafe HTML never render. This covers common note editing, not Obsidian's plugin or vault ecosystem.

Keyboard shortcuts: Ctrl/Cmd+B for bold, Ctrl/Cmd+I for italic, Ctrl/Cmd+K for links inside the editor (search elsewhere), Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z for undo/redo, Tab/Shift+Tab for list nesting, Ctrl/Cmd+Shift+M to switch source view, and Ctrl/Cmd+S to save now. Undo history is isolated to the current note and resets when loading remote or source changes. The notebook picker supports arrow keys and Escape and follows the selected color theme.

## Sharing and persistence

- The creator receives an **owner link**, stored in that browser and visible in Share. Keep it to return on other devices. There are no accounts, password recovery, or email invitations.
- View links can read every note. Edit links can add, edit, and delete notes. Only the owner can create/revoke sharing links or delete the notebook. Anyone holding a link has its access, so share it intentionally.
- Creating a new link replaces the previous link for that access level. **Revoke all sharing links** immediately invalidates both viewer and editor access, while keeping the owner link.
- Tokens use 256 bits of randomness, appear in URL fragments, and are sent only in Authorization headers. The server stores token hashes. Responses are not cached and use a no-referrer policy. Markdown is sanitized, raw images are omitted, and no external scripts or fonts are loaded.
- Autosave waits briefly after typing. Browsers refresh visible notebooks every 2.5 seconds. Simultaneous writes use note revisions: a stale write is rejected, and the user can save their local draft as another note or choose the latest version. This is shared editing, not character-by-character collaborative cursors or a CRDT editor.
- Unsaved drafts stay in browser storage and survive reload. If browser storage is blocked or full, the app reports it. Clearing browser data removes saved links and local drafts, but not server notes. Use the owner link to reopen a notebook. Export notes before deleting a notebook.
- Each notebook is limited to 100 notes, 100 KB per note, and 1 MB of note text. Anonymous creation has an approximate per-IP limit of 10 per minute per Cloudflare location. Same-office users share that limit. There is no published notebook directory.

The public example is intended for trying the template. Deploy your own copy for ongoing work. The application does not provide end-to-end encryption, identity-based permissions, revision history, attachments, or offline page caching. Unsaved drafts are recovered when the page can load again.

## Verify

```sh
npx playwright-core install chromium
npm test
```

Tests start an isolated local Worker and exercise formatted editing, Markdown round trips, task lists, tables, links, input shortcuts, undo isolation, the notebook picker, persisted CRUD, notebook isolation, access levels, revoked links, simultaneous writes, size limits, unsafe Markdown, separate browser sharing, automatic sync, offline draft recovery, and mobile layouts. Screenshots are written under ignored `artifacts/`. Set `CHROMIUM_PATH` to use an existing Chromium executable. `NOTES_TEST_ORIGIN` runs the same checks against an existing deployment and deletes only notebooks created by the test.

MIT licensed. Original interface and code; no Obsidian or Notion assets or integration.
