'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const BASE_DIR   = __dirname;
const LISTS_FILE = path.join(process.env.DATA_DIR || BASE_DIR, 'lists.json');
const PORT       = process.env.PORT || 8765;

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

// ── Lists file I/O ────────────────────────────────────────────
function readLists() {
  try {
    if (!fs.existsSync(LISTS_FILE)) return {};
    return JSON.parse(fs.readFileSync(LISTS_FILE, 'utf8'));
  } catch { return {}; }
}

function writeLists(lists) {
  fs.writeFileSync(LISTS_FILE, JSON.stringify(lists, null, 2), 'utf8');
}

// ── HTTP server ───────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  const pathname  = decodeURIComponent(parsedUrl.pathname);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── GET /api/lists — return all lists ──────────────────────
  if (pathname === '/api/lists' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readLists()));
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
      req.on('end', () => {
        try {
          const lists = readLists();
          lists[id] = JSON.parse(body);
          writeLists(lists);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        } catch {
          res.writeHead(400); res.end('Bad request');
        }
      });
      return;
    }

    if (req.method === 'DELETE') {
      const lists = readLists();
      delete lists[id];
      writeLists(lists);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
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
  console.log(`Tier Maker → http://localhost:${PORT}`);
});
