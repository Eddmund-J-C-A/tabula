# Scribae Tabula

Sheets (`tabula.html`) and Docs (`docs.html`) in one installable web app, plus an optional small server for accounts.

## Publish
**GitHub Pages only (no server):** upload everything except `server.js`. It runs in *local mode*: files stay in the browser, Drive = this browser, no accounts.

**With accounts:** run `node server.js` (Node 18+, no packages) on any host and put it behind HTTPS.
1. First start prints the admin password (or set `ADMIN_USER` / `ADMIN_PASS`). Sign in at `admin.html` and change it from the Account menu.
2. In `config.js` set `api:'https://your-server'`.
3. On the server set `SCRIBAE_ORIGIN=https://<you>.github.io` so only your site may call it (comma-separate several origins). Behind Caddy/nginx also set `TRUST_PROXY=1` so login throttling sees real client addresses.

Other env vars: `PORT`, `SCRIBAE_DATA` (default `./data`; back this up), `SCRIBAE_QUOTA_MB` (default 50 per user).

## Accounts, Drive, admin
- Each user's files live in `data/drive/<userId>/` and are only reachable with that user's session.
- Passwords are salted scrypt hashes. Nobody, including admins, can read them; admins can issue a temporary password.
- Admin console (`admin.html`): users (add, roles, disable, delete, reset password), storage, credit balances, open/closed registration, scheduled credit grants and scheduled key delivery (see below).

## Offline
Open the site once online, then use the browser's Install / Add to Home Screen. A service worker caches the app, so it works offline in any browser that supports them. For a fully self-contained copy, drop `xlsx.full.min.js` (SheetJS 0.18.5) next to the files. Files can always be opened from and saved to the device (`.tabula.json`, `.scribae-doc.json`, `.xlsx`, `.ods`, `.csv`, `.docx` ...).

## Integrating another app
- Embed `tabula.html` / `docs.html` in an iframe and list your site in `embedOrigins` (config.js). Send `{scribae:'open',content,name}` or `{scribae:'get'}`; replies are `{scribae:'doc',kind,name,content}`.
- REST API (Bearer session token or API key): `/api/login`, `/api/me`, `/api/files` (GET/POST), `/api/files/:id` (GET/DELETE), `/api/credits/spend` (POST `{amount}`). Files are `{id,name,kind:'sheet'|'doc',content}` where content is the native JSON.
- In-page: `Scribae.drive`, `Scribae.on('auth'|'ready')`, `Scribae.me`, `Scribae.clean(html)`.

## Launcher, admin entry, keys and credits
- `index.html` is the start page (the installed app opens it); Docs and Sheets link back to it from the brand name.
- The Admin link on the launcher appears only for signed-in admins. Direct URL: `admin.html` (it has its own sign-in).
- **Credits** are a per-user balance. The admin grants them (once or on a schedule); an integration spends them with `POST /api/credits/spend` using a key that has the `credits` permission.
- **API keys** (`scr_...`) are created by each user (Account > API keys) with read / write / credits permissions and an optional expiry. They work only on `/api/files`, `/api/me` (read) and `/api/credits/spend`; they cannot manage keys, change passwords or reach admin routes. Only a hash is stored, so a key is shown once. Never embed a key in a public site; each person pastes their own into the integration.
- **Key delivery:** the admin can deliver every active user a fresh read/write key now or every N days. Delivered keys wait, encrypted, in the user's inbox until they view and dismiss them; the admin never sees key values. "Revoke keys" in the console clears a user's keys.
