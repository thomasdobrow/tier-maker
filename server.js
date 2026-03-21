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

// ── Discord ────────────────────────────────────────────────────
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DISCORD_IDS = {
  'Tom':    '226884154610941952',
  'Joe':    '195063835416199168',
  'Kellen': '419855833086558208',
  'Arye':   '195313553341808642',
  'Sam':    '137441389783810048',
  'David':  '163132966535561216',
  'John':   '177182020345135105',
  'Jack':   '695462993919606855',
};

async function sendDraftStartedPing(draft) {
  if (!DISCORD_WEBHOOK_URL) return;
  const mentions = (draft.players || [])
    .filter(p => p !== draft.creator)
    .map(p => DISCORD_IDS[p] ? `<@${DISCORD_IDS[p]}>` : `**${p}**`);
  if (!mentions.length) return;
  const firstPlayer = (draft.turnOrder || [])[0] || draft.creator;
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `${mentions.join(' ')} The rotisserie draft has started — ${firstPlayer} picks first!`,
      }),
    });
  } catch (e) {
    console.error('Discord ping failed:', e.message);
  }
}

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

// ── Drafts I/O (file-only, no Redis) ─────────────────────────
const DRAFTS_FILE = path.join(process.env.DATA_DIR || BASE_DIR, 'drafts.json');

// One-time startup cleanup: remove Dan, rename John B → John in all drafts
function migrateOldUsers() {
  if (!fs.existsSync(DRAFTS_FILE)) return;
  try {
    const drafts = JSON.parse(fs.readFileSync(DRAFTS_FILE, 'utf8'));
    let changed = false;
    for (const d of Object.values(drafts)) {
      if ((d.players || []).includes('Dan') || d.creator === 'Dan') {
        d.players = (d.players || []).filter(p => p !== 'Dan');
        if (d.turnOrder) d.turnOrder = d.turnOrder.filter(p => p !== 'Dan');
        if (d.picks) delete d.picks['Dan'];
        if (d.creator === 'Dan') d.creator = d.players[0] || '';
        changed = true;
      }
      if ((d.players || []).includes('John B') || d.creator === 'John B') {
        d.players = (d.players || []).map(p => p === 'John B' ? 'John' : p);
        if (d.turnOrder) d.turnOrder = d.turnOrder.map(p => p === 'John B' ? 'John' : p);
        if (d.picks?.['John B']) {
          d.picks['John'] = (d.picks['John'] || []).concat(d.picks['John B']);
          delete d.picks['John B'];
        }
        if (d.creator === 'John B') d.creator = 'John';
        changed = true;
      }
    }
    for (const [id, d] of Object.entries(drafts)) {
      if ((d.players || []).length === 0) {
        delete drafts[id];
        changed = true;
        console.log(`migrateOldUsers: deleted empty draft ${id}`);
      }
    }
    if (changed) {
      fs.writeFileSync(DRAFTS_FILE, JSON.stringify(drafts, null, 2), 'utf8');
      console.log('migrateOldUsers: drafts.json patched');
    }
  } catch (e) { console.error('migrateOldUsers failed:', e.message); }
}
migrateOldUsers();

async function readDrafts() {
  try {
    if (!fs.existsSync(DRAFTS_FILE)) return {};
    return JSON.parse(fs.readFileSync(DRAFTS_FILE, 'utf8'));
  } catch { return {}; }
}
async function saveDraft(id, data) {
  const drafts = await readDrafts();
  drafts[id] = data;
  fs.writeFileSync(DRAFTS_FILE, JSON.stringify(drafts, null, 2), 'utf8');
}
async function removeDraft(id) {
  const drafts = await readDrafts();
  delete drafts[id];
  fs.writeFileSync(DRAFTS_FILE, JSON.stringify(drafts, null, 2), 'utf8');
}

// ── SSE broadcast ─────────────────────────────────────────────
const sseClients = new Set();

function broadcastDraft(type, payload) {
  const msg = `data: ${JSON.stringify({ type, ...payload })}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch { sseClients.delete(res); }
  }
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

  // ── GET /api/drafts/events — SSE stream ────────────────────
  if (pathname === '/api/drafts/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    res.write(':\n\n'); // initial ping to confirm connection
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // ── GET /api/drafts — return all drafts ────────────────────
  if (pathname === '/api/drafts' && req.method === 'GET') {
    try {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(await readDrafts()));
    } catch (e) { res.writeHead(500); res.end('Server error'); }
    return;
  }

  // ── POST /api/drafts/:id — save one draft ──────────────────
  // ── DELETE /api/drafts/:id — remove one draft ──────────────
  const draftMatch = pathname.match(/^\/api\/drafts\/([^/]+)$/);
  if (draftMatch) {
    const id = draftMatch[1];
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const draft     = JSON.parse(body);
          const allDrafts = await readDrafts();
          const existing  = allDrafts[id];
          // Guard: refuse to resurrect a deleted draft that was already active/complete.
          // New 'waiting' drafts are always allowed through (they're being created fresh).
          if (!existing && draft.status !== 'waiting') {
            res.writeHead(409).end('{"error":"draft deleted"}');
            return;
          }
          const justStarted = draft.status === 'active' && existing?.status !== 'active';
          allDrafts[id] = draft;
          fs.writeFileSync(DRAFTS_FILE, JSON.stringify(allDrafts, null, 2), 'utf8');
          broadcastDraft('draft_update', { draft });
          if (justStarted) sendDraftStartedPing(draft);
          res.writeHead(200).end('{"ok":true}');
        } catch { res.writeHead(400).end('Bad request'); }
      });
      return;
    }
    if (req.method === 'DELETE') {
      try {
        await removeDraft(id);
        broadcastDraft('draft_delete', { id });
        res.writeHead(200).end('{"ok":true}');
      } catch { res.writeHead(500).end('Server error'); }
      return;
    }
  }

  // ── Client-side routing — serve index.html for /draft/:id ──
  const clientRouteMatch = pathname.match(/^\/draft\/([^/]+)$/);
  if (clientRouteMatch && req.method === 'GET') {
    const htmlFile = path.join(BASE_DIR, 'index.html');
    const htmlStat = fs.statSync(htmlFile);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': htmlStat.size });
    fs.createReadStream(htmlFile).pipe(res);
    return;
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
