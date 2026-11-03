# Notes template

Keep this a simple Markdown notebook. Preserve functional editing, persistence, sharing, import/export, and conflict recovery when adapting it.

- `web/` is the frontend; `src/worker.js` is the Cloudflare Worker and SQLite Durable Object. `scripts/build.mjs` bundles local dependencies into `dist/`.
- Run `npm ci`, `npm test`, and `npm run build` before publishing changes. Browser tests require Chromium; see README. Use isolated notebooks and delete only test-created data.
- Deploy a new Worker with its own Durable Object storage in the customer's account. Rename the Worker; preserve the binding and migration. Never reuse the public demo's API/storage or copy customer data or credentials into this public repository.
- All access is through revocable notebook capability links. Enforce roles on the server, store only token hashes, keep tokens out of request paths/query strings/logs, and keep the no-referrer and no-store headers.
- Never silently overwrite a concurrent edit. Use note versions, preserve local drafts on failures, and require explicit conflict resolution.
- Render Markdown through DOMPurify with restricted tags/attributes. No external images, scripts, or analytics. Keep keyboard access and mobile layouts usable.
- Keep the upstream Git remote/history so future template fixes can be merged. Document changes to storage and access semantics.
