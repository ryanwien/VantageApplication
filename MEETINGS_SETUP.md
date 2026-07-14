# Vantage Meetings — Zoom & Google Meet setup

Create real Zoom / Google Meet meetings from the dashboard. Because a browser can't safely
hold OAuth **secrets**, this runs through a tiny local backend (`server/index.js`, no npm
dependencies). You register your own OAuth apps once, drop the credentials in `.env`, and run
the backend alongside the Vite dev server.

## 0. Prerequisites
- **Node 20+** (for `--env-file`). Check: `node --version`.
- The dashboard running as usual: `npm run dev` (http://127.0.0.1:5173).

## 1. Create `.env`
Copy the template and fill it in as you complete the steps below:
```
cp .env.example .env
```

## 2. Zoom app (for Zoom meetings)
1. Go to https://marketplace.zoom.us → **Develop → Build App**.
2. Choose a **General App** (OAuth, user-managed).
3. Under **OAuth**, set the **Redirect URL for OAuth** and add to the allow-list:
   ```
   http://localhost:8787/api/zoom/callback
   ```
4. Under **Scopes**, add: **`meeting:write`** (create meetings).
5. Copy the **Client ID** and **Client Secret** into `.env`:
   ```
   ZOOM_CLIENT_ID=...
   ZOOM_CLIENT_SECRET=...
   ```

## 3. Google Meet (via Google Calendar API)
1. Go to https://console.cloud.google.com → create/select a project.
2. **APIs & Services → Library → enable "Google Calendar API"**.
3. **OAuth consent screen**: set it up (External is fine); add your Google account under **Test users**.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
5. Add **Authorized redirect URI**:
   ```
   http://localhost:8787/api/google/callback
   ```
6. Copy the **Client ID** and **Client Secret** into `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

## 4. Run the backend
In the project folder, in a **second terminal** (keep `npm run dev` running in the first):
```
node --env-file=.env server/index.js
```
It prints which providers are configured and the exact redirect URIs to register (handy for
double-checking step 2/3). It listens on **http://localhost:8787**; the Vite dev server proxies
`/api` to it automatically (see `vite.config.js`).

## 5. Use it
1. **Sign in first.** Connected meetings are stored **per user**, so you need a backend account —
   create one at the sign-in gate (the backend must be running). Guests see "Sign in to connect".
2. In the dashboard: **settings → MEET**.
3. Click **Connect Zoom** / **Connect Google Meet** → approve the consent screen → you bounce
   back to the app, now "connected" (under *your* account).
4. Click **＋ New meeting** → it creates a meeting on your account and opens the host link in a new
   tab. The link also appears under **Recent meetings**.

> No setup at all? The **⚡ Go Live** box at the top of the MEET tab opens an instant Meet/Zoom in a
> tab (or pins any link you paste) — no sign-in, no OAuth, no `.env`.

## Notes
- `.env`, `server/tokens.json`, `server/users.json`, and `server/sessions.json` are gitignored —
  **never commit them**. Password hashes and tokens are stored locally only.
- OAuth tokens are keyed by the signed-in account, so multiple users can each connect their own
  Zoom/Google from one backend.
- Zoom meetings are created as **instant** meetings on your account; Google meetings are created
  as a short Calendar event (starts in ~1 min) with a Meet link attached.
- This is local/dev-oriented. For a shared deployment you'd host the backend over HTTPS and set
  `PUBLIC_ORIGIN` / `APP_ORIGIN` to your real domains (and register those redirect URIs).
- Nothing here was end-to-end tested with live credentials — if a connect/create call fails, the
  error surfaces in the Meetings tab; paste it and I'll pinpoint the fix.
