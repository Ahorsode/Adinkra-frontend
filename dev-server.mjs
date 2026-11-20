// Local preview that behaves like Vercel: serves public/ and forwards /api/* to the Worker.
//   node dev-server.mjs                      # API at http://127.0.0.1:8787 (wrangler dev)
//   API_URL=https://...workers.dev node dev-server.mjs
// Open http://localhost:3000
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const API = (process.env.API_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const PORT = Number(process.env.PORT) || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.json': 'application/json',
};

http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const headers = { ...req.headers, 'x-forwarded-for': req.socket.remoteAddress, 'x-forwarded-proto': 'http' };
      delete headers.host;
      delete headers.connection;
      const upstream = await fetch(API + req.url, {
        method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined, redirect: 'manual',
      });
      const out = {};
      upstream.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding', 'set-cookie'].includes(k)) out[k] = v; });
      const cookies = upstream.headers.getSetCookie?.() || [];
      if (cookies.length) out['set-cookie'] = cookies;
      res.writeHead(upstream.status, out);
      res.end(Buffer.from(await upstream.arrayBuffer()));
      return;
    }
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `API not reachable at ${API}: ${e.message}` }));
  }
}).listen(PORT, () => console.log(`Frontend on http://localhost:${PORT} → API ${API}`));
