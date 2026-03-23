'use strict';
// ── Production user migration ──────────────────────────────────
// - Remove all lists/drafts owned by or referencing 'Arye'
//
// Run with:
//   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... node migrate_users.js

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const path = require('path');
const fs   = require('fs');

if (!UPSTASH_URL || !UPSTASH_TOKEN) {
  console.error('Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN');
  process.exit(1);
}

async function redis(...args) {
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const json = await res.json();
  if (json.error) throw new Error(`Redis error: ${json.error}`);
  return json.result;
}

async function main() {
  // ── 1. Read all lists ───────────────────────────────────────
  const ids = await redis('HKEYS', 'tm:index');
  console.log(`Found ${ids.length} list(s) in Redis`);
  if (!ids.length) { console.log('Nothing to do.'); return; }

  const vals = await redis('MGET', ...ids.map(id => `tm:list:${id}`));
  const lists = ids.map((id, i) => ({ id, data: vals[i] ? JSON.parse(vals[i]) : null }))
                   .filter(l => l.data);

  // ── 2. Report what we found ─────────────────────────────────
  const allCreators = [...new Set(lists.map(l => l.data.creator).filter(Boolean))];
  console.log(`\nAll creators found:`, allCreators.sort());

  // ── 3. Delete Arye's lists ──────────────────────────────────
  for (const { id, data } of lists) {
    if (data.creator === 'Arye') {
      await redis('DEL', `tm:list:${id}`);
      await redis('HDEL', 'tm:index', id);
      console.log(`  ✗ Deleted "${data.name}" (${id}) — creator was Arye`);
    }
  }

  // ── 4. Check drafts.json for dangling references ─────────────
  const DRAFTS_FILE = path.join(__dirname, 'drafts.json');
  if (fs.existsSync(DRAFTS_FILE)) {
    const drafts = JSON.parse(fs.readFileSync(DRAFTS_FILE, 'utf8'));
    let draftsChanged = false;
    for (const [draftId, draft] of Object.entries(drafts)) {
      const hasArye = (draft.players || []).includes('Arye') || draft.creator === 'Arye';
      if (!hasArye) continue;

      console.log(`\nDraft ${draftId} (status=${draft.status}) references Arye`);

      draft.players = (draft.players || []).filter(p => p !== 'Arye');
      if (draft.turnOrder) draft.turnOrder = draft.turnOrder.filter(p => p !== 'Arye');
      if (draft.bots) draft.bots = draft.bots.filter(p => p !== 'Arye');
      if (draft.picks) delete draft.picks['Arye'];
      if (draft.creator === 'Arye') draft.creator = draft.players[0] || '';
      draftsChanged = true;
      console.log(`  ✗ Removed Arye from draft ${draftId}`);
    }

    // Remove any drafts that are now empty of players
    for (const [id, d] of Object.entries(drafts)) {
      if ((d.players || []).length === 0) {
        delete drafts[id];
        draftsChanged = true;
        console.log(`  ✗ Deleted empty draft ${id}`);
      }
    }

    if (draftsChanged) {
      fs.writeFileSync(DRAFTS_FILE, JSON.stringify(drafts, null, 2), 'utf8');
      console.log('\ndrafts.json updated.');
    }
  } else {
    console.log('\nNo local drafts.json found (production uses file on Koyeb).');
  }

  // ── 5. Final creator roster ──────────────────────────────────
  const finalIds  = await redis('HKEYS', 'tm:index');
  const finalVals = finalIds.length ? await redis('MGET', ...finalIds.map(id => `tm:list:${id}`)) : [];
  const finalCreators = [...new Set(
    finalVals.map(v => v ? JSON.parse(v).creator : null).filter(Boolean)
  )].sort();
  console.log('\n✓ Final creator roster:', finalCreators);

  const VALID_USERS = ['Tom', 'Joe', 'Kellen', 'Aeye', 'Sam', 'David', 'John B', 'Jack', 'Danny'];
  const missing = finalCreators.filter(u => !VALID_USERS.includes(u));
  if (missing.length) {
    console.log('⚠ Users WITHOUT Discord ID mapping:', missing);
  } else {
    console.log('✓ All creators have a Discord ID mapped.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
