# Scribae Tabula

Sheets (`tabula.html`), Docs (`docs.html`), a launcher (`index.html`) and an admin console (`admin.html`) on GitHub Pages,
with an optional free backend on Cloudflare (`cloudflare/`) for accounts, per-user Drive, API keys and credits.

## Backend setup (Cloudflare, free, no card)
Run these in a terminal inside the `cloudflare/` folder. You need Node.js on your computer.
1. Create a free account at dash.cloudflare.com and verify your email.
2. `npx wrangler login` (authorise in the browser).
3. `npx wrangler d1 create scribae`, then copy the `database_id` it prints into `wrangler.toml`.
4. In `wrangler.toml` set `ALLOWED_ORIGINS` to your site's origin, e.g. `https://yourname.github.io` (no path, no trailing slash; comma-separate several).
5. `npx wrangler deploy`. The first time it may ask you to pick a `workers.dev` name. It prints your API address.
6. Secrets (paste a value when asked):
   - `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` to make a random value, then `npx wrangler secret put SESSION_SECRET`
   - `npx wrangler secret put SETUP_CODE` (any code you choose; it only lets you create the first admin)
7. Open `<your address>/api/ping`. You should see `{"ok":1,"open":true,"setup":true}` (this also creates the tables).
8. Put the address in `config.js` (`api:'https://scribae-api.<you>.workers.dev'`), commit and push.
9. Open `admin.html` on your site and use "Create the first admin" with your setup code. Afterwards you can run `npx wrangler secret delete SETUP_CODE`.

## Running it
- Update the backend: edit `worker.js`, run `npx wrangler deploy`.
- Logs: `npx wrangler tail`.
- Backup: `npx wrangler d1 export scribae --remote --output=backup.sql` (do this regularly).
- Keep `SESSION_SECRET` the same. Changing it signs everyone out and drops undelivered keys.

## How it works
- Passwords are stretched in the browser (PBKDF2, 600,000 rounds). The Worker only receives that derived key and stores a cheap hash of it, which keeps it inside the free plan's CPU limit. Nobody, including admins, can read passwords. Admin "Reset password" issues a one-time code valid for 24 hours; the user enters it under "Reset with code" in the sign-in box.
- Each user's files are stored under their own id. Free-plan limits: 100,000 requests a day, files up to about 1.2 MB, 20 MB per user, hourly scheduled jobs.
- **Credits** are a per-user balance. The admin grants them (once or on a schedule); an integration spends them with `POST /api/credits/spend {amount}` using a key with the `credits` permission.
- **API keys** (`scr_...`) are created by each user (Account > API keys) with read / write / credits permissions and an optional expiry. They work on `/api/files`, `/api/me` (read) and `/api/credits/spend` only. Only a hash is stored, so a key is shown once. Never put a key in a public site; each person pastes their own into an integration.
- **Key delivery:** the admin can deliver every active user a fresh read/write key now or every N days. It waits, encrypted, in the user's inbox until they view and dismiss it; the admin never sees key values.
- Launcher: `index.html` is the start page. Its Admin link only appears for signed-in admins.

## Integrating another app
- Embed `tabula.html` / `docs.html` in an iframe and list your site in `embedOrigins` (config.js). Send `{scribae:'open',content,name}` or `{scribae:'get'}`; replies are `{scribae:'doc',kind,name,content}`.
- REST API (Bearer session token or API key): `/api/me`, `/api/files` (GET/POST), `/api/files/:id` (GET/DELETE), `/api/credits/spend` (POST). Files are `{id,name,kind:'sheet'|'doc',content}` where content is the native JSON.

## Offline
Open the site once online, then Install / Add to Home Screen. A service worker caches the app. Drop `xlsx.full.min.js` (SheetJS 0.18.5) next to the files for a fully self-contained copy.

## legacy/
`legacy/server.js` is the earlier Node server for a VPS. It does not speak the new browser-side password protocol, so don't use it with these pages.
