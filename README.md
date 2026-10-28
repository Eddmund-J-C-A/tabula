# Scribae Tabula

Sheets (`tabula.html`) and Docs (`docs.html`) in one installable web app, plus an optional small server for accounts.

## Publish
**GitHub Pages only (no server):** upload everything except `server.js`. It runs in *local mode*: files stay in the browser, Drive = this browser, no accounts.

**With accounts:** run `node server.js` (Node 18+, no packages) on any host and put it behind HTTPS.
1. First start prints the admin password (or set `ADMIN_USER` / `ADMIN_PASS`). Sign in at `admin.html` and change it from the Account menu.
2. In `config.js` set `api:'https://your-server'`.
3. On the server set `SCRIBAE_ORIGIN=https://<you>.github.io` so only your site may call it.

Other env vars: `PORT`, `SCRIBAE_DATA` (default `./data`; back this up), `SCRIBAE_QUOTA_MB` (default 50 per user).

## Accounts, Drive, admin
- Each user's files live in `data/drive/<userId>/` and are only reachable with that user's session.
- Passwords are salted scrypt hashes. Nobody, including admins, can read them; admins can issue a temporary password.
- Admin console (`admin.html`): users, roles, disable/delete, storage, token balances, open/closed registration, and a periodic token grant (amount + every N hours) or "Grant to all now". "Tokens" are a per-user credit balance for future features/integrations.

## Offline
Open the site once online, then use the browser's Install / Add to Home Screen. A service worker caches the app, so it works offline in any browser that supports them. For a fully self-contained copy, drop `xlsx.full.min.js` (SheetJS 0.18.5) next to the files. Files can always be opened from and saved to the device (`.tabula.json`, `.scribae-doc.json`, `.xlsx`, `.ods`, `.csv`, `.docx` ...).

## Integrating another app
- Embed `tabula.html` / `docs.html` in an iframe and list your site in `embedOrigins` (config.js). Send `{scribae:'open',content,name}` or `{scribae:'get'}`; replies are `{scribae:'doc',kind,name,content}`.
- REST API (Bearer token): `/api/login`, `/api/me`, `/api/files` (GET/POST), `/api/files/:id` (GET/DELETE). Files are `{id,name,kind:'sheet'|'doc',content}` where content is the native JSON.
- In-page: `Scribae.drive`, `Scribae.on('auth'|'ready')`, `Scribae.me`, `Scribae.clean(html)`.
