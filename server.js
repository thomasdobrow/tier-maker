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
const APP_URL = (process.env.APP_URL || 'https://agricola-tomtom-173540a3.koyeb.app').replace(/\/$/, '');
const DISCORD_IDS = {
  'Tom':    '226884154610941952',
  'Joe':    '195063835416199168',
  'Kellen': '419855833086558208',
  'Aeye':   '195313553341808642',
  'Sam':    '137441389783810048',
  'David':  '163132966535561216',
  'John B': '177182020345135105',
  'Jack':   '695462993919606855',
  'Danny':  '525384290591047701',
};

async function sendDraftStartedPing(draft) {
  console.log('[discord] sendDraftStartedPing called, players:', draft.players, 'bots:', draft.bots, 'webhook set:', !!DISCORD_WEBHOOK_URL);
  if (!DISCORD_WEBHOOK_URL) { console.log('[discord] no webhook URL, skipping'); return; }
  const bots = new Set(draft.bots || []);
  const mentions = (draft.players || [])
    .filter(p => !bots.has(p))
    .map(p => DISCORD_IDS[p] ? `<@${DISCORD_IDS[p]}>` : `**${p}**`);
  console.log('[discord] mentions:', mentions);
  if (!mentions.length) { console.log('[discord] no mentions, skipping'); return; }
  const firstHuman = (draft.turnOrder || []).find(p => !bots.has(p)) || draft.creator;
  const content = `${mentions.join(' ')} The rotisserie draft has started — ${firstHuman} picks first (among humans)!\n${APP_URL}/draft/${draft.id}`;
  console.log('[discord] sending:', content);
  try {
    const r = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    console.log('[discord] response status:', r.status);
    if (!r.ok) console.error('[discord] error body:', await r.text());
  } catch (e) {
    console.error('[discord] fetch threw:', e.message);
  }
}

async function sendIdleTurnPing(draft, currentPlayer) {
  console.log('[discord] sendIdleTurnPing called, player:', currentPlayer, 'webhook set:', !!DISCORD_WEBHOOK_URL);
  if (!DISCORD_WEBHOOK_URL) { console.log('[discord] no webhook URL, skipping'); return; }
  const mention = DISCORD_IDS[currentPlayer] ? `<@${DISCORD_IDS[currentPlayer]}>` : `**${currentPlayer}**`;
  const content = `${mention} It's your pick in the rotisserie draft — you've been up for 12+ hours!\n${APP_URL}/draft/${draft.id}`;
  console.log('[discord] sending idle ping:', content);
  try {
    const r = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    console.log('[discord] idle ping response status:', r.status);
    if (!r.ok) console.error('[discord] idle ping error body:', await r.text());
  } catch (e) { console.error('[discord] idle ping fetch threw:', e.message); }
}

const IDLE_PING_MS = 12 * 60 * 60 * 1000; // 12 hours

async function checkIdleTurns() {
  try {
    const drafts = await readDrafts();
    for (const draft of Object.values(drafts)) {
      if (draft.status !== 'active') continue;
      const currentPlayer = getSnakeDraftPlayerServer(draft.turnOrder, draft.currentTurnIdx);
      if ((draft.bots || []).includes(currentPlayer)) continue; // bot's turn — skip
      if (!draft.lastTurnStartedAt) continue;                   // old draft without timestamp — skip
      if (draft.lastIdlePingAt) continue;                       // already pinged this turn
      const elapsed = Date.now() - new Date(draft.lastTurnStartedAt).getTime();
      if (elapsed < IDLE_PING_MS) continue;
      console.log(`[idle] pinging ${currentPlayer} for draft ${draft.id} (${Math.round(elapsed / 3600000)}h elapsed)`);
      await sendIdleTurnPing(draft, currentPlayer);
      const updated = { ...draft, lastIdlePingAt: new Date().toISOString() };
      await saveDraft(draft.id, updated);
      broadcastDraft('draft_update', { draft: updated });
    }
  } catch (e) { console.error('checkIdleTurns error:', e.message); }
}

const MIME = {
  '.html':  'text/html; charset=utf-8',
  '.css':   'text/css',
  '.js':    'application/javascript',
  '.json':  'application/json',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
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

// ── Drafts I/O (Redis when available, file fallback for local dev) ──
const DRAFTS_FILE = path.join(process.env.DATA_DIR || BASE_DIR, 'drafts.json');

// One-time startup cleanup (file-based only — Redis was already cleaned in production)
function migrateOldUsers() {
  if (USE_REDIS) return; // production Redis already migrated
  if (!fs.existsSync(DRAFTS_FILE)) return;
  try {
    const drafts = JSON.parse(fs.readFileSync(DRAFTS_FILE, 'utf8'));
    let changed = false;
    for (const d of Object.values(drafts)) {
      // Remove Dan (legacy test data)
      if ((d.players || []).includes('Dan') || d.creator === 'Dan') {
        d.players = (d.players || []).filter(p => p !== 'Dan');
        if (d.turnOrder) d.turnOrder = d.turnOrder.filter(p => p !== 'Dan');
        if (d.picks) delete d.picks['Dan'];
        if (d.creator === 'Dan') d.creator = d.players[0] || '';
        changed = true;
      }
      // Remove Arye
      if ((d.players || []).includes('Arye') || d.creator === 'Arye') {
        d.players = (d.players || []).filter(p => p !== 'Arye');
        if (d.turnOrder) d.turnOrder = d.turnOrder.filter(p => p !== 'Arye');
        if (d.bots) d.bots = d.bots.filter(p => p !== 'Arye');
        if (d.picks) delete d.picks['Arye'];
        if (d.creator === 'Arye') d.creator = d.players[0] || '';
        changed = true;
      }
      // Rename John → John B
      if ((d.players || []).includes('John') || d.creator === 'John') {
        d.players = (d.players || []).map(p => p === 'John' ? 'John B' : p);
        if (d.turnOrder) d.turnOrder = d.turnOrder.map(p => p === 'John' ? 'John B' : p);
        if (d.bots) d.bots = d.bots.map(p => p === 'John' ? 'John B' : p);
        if (d.picks?.['John']) {
          d.picks['John B'] = (d.picks['John B'] || []).concat(d.picks['John']);
          delete d.picks['John'];
        }
        if (d.creator === 'John') d.creator = 'John B';
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

// ── Bot draft logic ────────────────────────────────────────────

function getSnakeDraftPlayerServer(turnOrder, idx) {
  const n = turnOrder.length;
  const pos = idx % n;
  return turnOrder[Math.floor(idx / n) % 2 === 0 ? pos : n - 1 - pos];
}

function computeBotRanking(lists, undraftedCards) {
  const TIERS = ['S', 'A', 'B', 'C', 'F'];
  const rankSums = {}, rankCounts = {};
  const vcLists = Object.values(lists).filter(
    l => (l.type || 'agricola') === 'vintage_cube' && l.state?.tiers
  );
  for (const list of vcLists) {
    let rank = 1;
    for (const tier of TIERS)
      for (const card of (list.state.tiers[tier] || []))
        { rankSums[card] = (rankSums[card] || 0) + rank; rankCounts[card] = (rankCounts[card] || 0) + 1; rank++; }
  }
  const ranked = Object.keys(rankSums).sort((a, b) =>
    rankSums[a] / rankCounts[a] - rankSums[b] / rankCounts[b]
  );
  const rankedSet = new Set(ranked);
  const unranked = (undraftedCards || []).filter(c => !rankedSet.has(c));
  return [...ranked, ...unranked];
}

const botRankingCache = new Map(); // draftId → string[]
const pendingBotPicks = new Map(); // draftId → timeoutId

function scheduleBotPick(draftId, delayMs = 2000) {
  if (pendingBotPicks.has(draftId)) clearTimeout(pendingBotPicks.get(draftId));
  const tid = setTimeout(() => { pendingBotPicks.delete(draftId); makeBotPick(draftId); }, delayMs);
  pendingBotPicks.set(draftId, tid);
}

async function makeBotPick(draftId) {
  try {
    const allDrafts = await readDrafts();
    const draft = allDrafts[draftId];
    if (!draft || draft.status !== 'active') return;
    const currentPlayer = getSnakeDraftPlayerServer(draft.turnOrder, draft.currentTurnIdx);
    if (!(draft.bots || []).includes(currentPlayer)) return;

    if (!botRankingCache.has(draftId)) {
      const lists = await readLists();
      botRankingCache.set(draftId, computeBotRanking(lists, draft.undraftedCards));
    }
    const ranking = botRankingCache.get(draftId);
    const undraftedSet = new Set(draft.undraftedCards);
    const topCards = ranking.filter(c => undraftedSet.has(c)).slice(0, 10);
    if (!topCards.length) return;

    // Log-backoff weights: 2^(N-1), 2^(N-2), ..., 1
    const weights = topCards.map((_, i) => Math.pow(2, topCards.length - 1 - i));
    const total = weights.reduce((a, b) => a + b, 0);
    let rnd = Math.random() * total;
    let pick = topCards[topCards.length - 1];
    for (let i = 0; i < topCards.length; i++) { rnd -= weights[i]; if (rnd <= 0) { pick = topCards[i]; break; } }

    const picks = { ...draft.picks };
    picks[currentPlayer] = [...(picks[currentPlayer] || []), pick];
    const undraftedCards = draft.undraftedCards.filter(c => c !== pick);
    const isDone = draft.turnOrder.every(p => (picks[p] || []).length >= 40);
    const updated = {
      ...draft, picks, undraftedCards,
      currentTurnIdx: draft.currentTurnIdx + 1,
      lastTurnStartedAt: new Date().toISOString(),
      lastIdlePingAt: null,
      ...(isDone ? { status: 'complete', completedAt: new Date().toISOString() } : {}),
    };
    await saveDraft(draftId, updated);
    broadcastDraft('draft_update', { draft: updated });

    if (!isDone) {
      const nextPlayer = getSnakeDraftPlayerServer(updated.turnOrder, updated.currentTurnIdx);
      if ((updated.bots || []).includes(nextPlayer)) scheduleBotPick(draftId);
    } else {
      botRankingCache.delete(draftId);
    }
  } catch (e) { console.error('makeBotPick error:', e.message); }
}

async function recoverBotPicks() {
  try {
    const drafts = await readDrafts();
    const lists  = await readLists();
    for (const draft of Object.values(drafts)) {
      if (draft.status !== 'active' || !(draft.bots?.length)) continue;
      const currentPlayer = getSnakeDraftPlayerServer(draft.turnOrder, draft.currentTurnIdx);
      if (draft.bots.includes(currentPlayer)) {
        botRankingCache.set(draft.id, computeBotRanking(lists, draft.undraftedCards));
        scheduleBotPick(draft.id, 3000);
        console.log(`recoverBotPicks: scheduled pick for ${currentPlayer} in draft ${draft.id}`);
      }
    }
  } catch (e) { console.error('recoverBotPicks error:', e.message); }
}
recoverBotPicks();
checkIdleTurns();                                       // check immediately on startup (handles restarts mid-turn)
setInterval(checkIdleTurns, 60 * 60 * 1000);            // then every hour

async function readDrafts() {
  if (USE_REDIS) {
    const ids = await redis('HKEYS', 'tm:draft-index').catch(() => []);
    if (!ids || !ids.length) return {};
    const vals = await redis('MGET', ...ids.map(id => `tm:draft:${id}`));
    const out = {};
    ids.forEach((id, i) => { if (vals[i]) out[id] = JSON.parse(vals[i]); });
    return out;
  }
  try {
    if (!fs.existsSync(DRAFTS_FILE)) return {};
    return JSON.parse(fs.readFileSync(DRAFTS_FILE, 'utf8'));
  } catch { return {}; }
}
async function saveDraft(id, data) {
  if (USE_REDIS) {
    await Promise.all([
      redis('SET', `tm:draft:${id}`, JSON.stringify(data)),
      redis('HSET', 'tm:draft-index', id, data.createdAt || id),
    ]);
    return;
  }
  const drafts = await readDrafts();
  drafts[id] = data;
  fs.writeFileSync(DRAFTS_FILE, JSON.stringify(drafts, null, 2), 'utf8');
}
async function removeDraft(id) {
  if (USE_REDIS) {
    await Promise.all([
      redis('DEL', `tm:draft:${id}`),
      redis('HDEL', 'tm:draft-index', id),
    ]);
    return;
  }
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

  // ── GET /api/test-discord — fire a test ping ───────────────
  if (pathname === '/api/test-discord' && req.method === 'GET') {
    const result = { webhookSet: !!DISCORD_WEBHOOK_URL };
    if (DISCORD_WEBHOOK_URL) {
      try {
        const r = await fetch(DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: '🧪 Discord webhook test from tier maker server' }),
        });
        result.status = r.status;
        result.ok = r.ok;
        if (!r.ok) result.body = await r.text();
      } catch (e) { result.error = e.message; }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  // ── GET /api/users — list registered users ─────────────────
  if (pathname === '/api/users' && req.method === 'GET') {
    try {
      const users = USE_REDIS
        ? (await redis('SMEMBERS', 'tm:users').catch(() => []))
        : [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(users.sort()));
    } catch (e) { res.writeHead(500); res.end('Server error'); }
    return;
  }

  // ── POST /api/users/:name — register a user ─────────────────
  const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch && req.method === 'POST') {
    const name = userMatch[1];
    try {
      if (USE_REDIS && name) await redis('SADD', 'tm:users', name);
      res.writeHead(200).end('{"ok":true}');
    } catch { res.writeHead(500).end('Server error'); }
    return;
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
          // On draft start: seed bot ranking cache if there are bots
          if (justStarted && draft.bots?.length) {
            const lists = await readLists();
            botRankingCache.set(id, computeBotRanking(lists, draft.undraftedCards));
          }
          // Stamp turn start time so idle checker knows when the current player's turn began
          if (justStarted) {
            draft.lastTurnStartedAt = new Date().toISOString();
            draft.lastIdlePingAt = null;
          }
          const turnAdvanced = draft.status === 'active'
            && existing
            && draft.currentTurnIdx !== existing.currentTurnIdx;
          if (turnAdvanced) {
            draft.lastTurnStartedAt = new Date().toISOString();
            draft.lastIdlePingAt = null;
          }
          await saveDraft(id, draft);
          broadcastDraft('draft_update', { draft });
          if (justStarted) sendDraftStartedPing(draft);
          // Schedule bot pick if it's currently a bot's turn
          if (draft.status === 'active' && draft.bots?.length) {
            const nextPlayer = getSnakeDraftPlayerServer(draft.turnOrder, draft.currentTurnIdx);
            if (draft.bots.includes(nextPlayer)) scheduleBotPick(id);
          }
          res.writeHead(200).end('{"ok":true}');
        } catch { res.writeHead(400).end('Bad request'); }
      });
      return;
    }
    if (req.method === 'DELETE') {
      try {
        await removeDraft(id);
        broadcastDraft('draft_delete', { id });
        // Clean up any pending bot state for this draft
        if (pendingBotPicks.has(id)) { clearTimeout(pendingBotPicks.get(id)); pendingBotPicks.delete(id); }
        botRankingCache.delete(id);
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
