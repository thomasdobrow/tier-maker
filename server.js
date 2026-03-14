'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const BASE_DIR = __dirname;
const PORT     = process.env.PORT || 8765;

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const USE_REDIS     = !!(UPSTASH_URL && UPSTASH_TOKEN);
const LISTS_FILE    = path.join(process.env.DATA_DIR || BASE_DIR, 'lists.json');

const MIME = {
  '.html':  'text/html; charset=utf-8',
  '.css':   'text/css',
  '.js':    'application/javascript',
  '.json':  'application/json',
  '.png':   'image/png',
  '.webp':  'image/webp',
  '.gif':   'image/gif',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
};

// ── Redis (Upstash REST) ───────────────────────────────────────
async function redis(...args) {
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const json = await res.json();
  if (json.error) throw new Error(`Redis error: ${json.error}`);
  return json.result;
}

// ── Lists I/O ─────────────────────────────────────────────────
async function readLists() {
  if (!USE_REDIS) {
    try {
      if (!fs.existsSync(LISTS_FILE)) return {};
      return JSON.parse(fs.readFileSync(LISTS_FILE, 'utf8'));
    } catch { return {}; }
  }
  const ids = await redis('HKEYS', 'tm:index');
  if (!ids || ids.length === 0) return {};
  const vals = await redis('MGET', ...ids.map(id => `tm:list:${id}`));
  const out = {};
  ids.forEach((id, i) => { if (vals[i]) out[id] = JSON.parse(vals[i]); });
  return out;
}

async function saveList(id, data) {
  if (!USE_REDIS) {
    const lists = await readLists();
    lists[id] = data;
    fs.writeFileSync(LISTS_FILE, JSON.stringify(lists, null, 2), 'utf8');
    return;
  }
  await Promise.all([
    redis('SET', `tm:list:${id}`, JSON.stringify(data)),
    redis('HSET', 'tm:index', id, data.name || id),
  ]);
}

async function removeList(id) {
  if (!USE_REDIS) {
    const lists = await readLists();
    delete lists[id];
    fs.writeFileSync(LISTS_FILE, JSON.stringify(lists, null, 2), 'utf8');
    return;
  }
  await Promise.all([
    redis('DEL', `tm:list:${id}`),
    redis('HDEL', 'tm:index', id),
  ]);
}

// ── HTTP server ───────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url);
  const pathname  = decodeURIComponent(parsedUrl.pathname);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── GET /api/lists — return all lists ──────────────────────
  if (pathname === '/api/lists' && req.method === 'GET') {
    try {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(await readLists()));
    } catch (e) {
      console.error('readLists error:', e);
      res.writeHead(500); res.end('Server error');
    }
    return;
  }

  // ── POST /api/lists/:id — save one list ────────────────────
  // ── DELETE /api/lists/:id — remove one list ───────────────
  const listMatch = pathname.match(/^\/api\/lists\/([^/]+)$/);
  if (listMatch) {
    const id = listMatch[1];

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          await saveList(id, JSON.parse(body));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        } catch (e) {
          console.error('saveList error:', e);
          res.writeHead(400); res.end('Bad request');
        }
      });
      return;
    }

    if (req.method === 'DELETE') {
      try {
        await removeList(id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        console.error('removeList error:', e);
        res.writeHead(500); res.end('Server error');
      }
      return;
    }
  }

  // ── Static files ───────────────────────────────────────────
  let filePath = path.normalize(path.join(BASE_DIR, pathname === '/' ? 'index.html' : pathname));

  // Prevent path traversal outside BASE_DIR
  if (!filePath.startsWith(BASE_DIR + path.sep) && filePath !== BASE_DIR) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404); res.end('Not found: ' + pathname); return;
  }

  const stat = fs.statSync(filePath);

  // Directory → HTML listing (needed by autoLoadAgricolaCards in the browser)
  if (stat.isDirectory()) {
    try {
      const files = fs.readdirSync(filePath).sort();
      const links = files.map(f => `<a href="${encodeURIComponent(f)}">${f}</a>`).join('\n');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html><html><body>\n${links}\n</body></html>`);
    } catch { res.writeHead(500); res.end('Server error'); }
    return;
  }

  // Regular file
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Tier Maker → http://localhost:${PORT}  [${USE_REDIS ? 'Redis' : 'file'}]`);
});
