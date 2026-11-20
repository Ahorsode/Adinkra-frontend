# Adinkra Airways — Frontend (Vercel)

The website for Adinkra Airways: a single-page app in plain JavaScript modules, with **no build step**.
Vercel serves the files in `public/` and forwards every `/api/*` request to the API Worker
([Adinkra-backend](https://github.com/Ahorsode/Adinkra-backend): Cloudflare Workers + Neon Postgres, Neon Auth and Neon Realtime).

Because the API goes through the same domain, the session cookie stays first-party (Safari and Chrome
block cross-site cookies) and no CORS setup is needed.

## Deploy to Vercel

1. Deploy the backend first and copy its URL, e.g. `https://adinkra-airways-api.<your-subdomain>.workers.dev`.
2. In `vercel.json`, replace `adinkra-airways-api.YOUR-SUBDOMAIN.workers.dev` in the `/api/:path*` rewrite with that host. Commit and push.
3. In Vercel: **Add New → Project → Import** this GitHub repo. Framework preset: **Other**. Leave build and
   output settings as they are (`vercel.json` sets them). Click **Deploy**.

Then add your Vercel URL to Neon as a trusted domain (sign-in fails with "Invalid origin" until you do) and as a Realtime origin; the exact commands are in the backend README, step 8. Open the Vercel URL and sign in with a demo account (listed in the backend README).

If you later attach a custom domain, add it to Neon the same way (trusted domain + Realtime origin); nothing else changes, because the browser only ever talks to the site's own domain.

## Run locally

With the API running locally (`npm run dev` in the backend, port 8787):

```powershell
node dev-server.mjs
```

Open http://localhost:3000. To point at the deployed Worker instead:

```powershell
$env:API_URL = "https://adinkra-airways-api.<your-subdomain>.workers.dev"; node dev-server.mjs
```

## What's here

```
public/            The site (index.html, css/, js/, img/)
public/vendor/     jsQR (staff gate scanner) and neon-realtime.js (live flight status), both committed
vercel.json        Static hosting, /api rewrite, security headers (CSP allows wss://*.neon.tech for Realtime), cache rules
package.json       Only for rebuilding public/vendor/neon-realtime.js: npm install, then npm run vendor
dev-server.mjs     Local stand-in for Vercel: static files + /api proxy
```

The code in `public/` started as the original app's `public/` folder. Additions: `vendor/`, a **Forgot password** page (6-digit code from Neon Auth), and **live updates** on the flight status page (`js/live.js`, Neon Realtime, with the 30-second refresh kept as a fallback).
