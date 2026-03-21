'use strict';
// ── Production user migration ──────────────────────────────────
// - Delete all lists owned by 'Dan'
// - Reassign all lists owned by 'John B' to 'John'
// - Delete all drafts created by or only containing 'Dan' / 'John B'
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
  const danLists   = lists.filter(l => l.data.creator === 'Dan');
  const johnBLists = lists.filter(l => l.data.creator === 'John B');
  const otherUsers = [...new Set(lists.map(l => l.data.creator).filter(Boolean))];

  console.log(`\nDan's lists (${danLists.length}):`, danLists.map(l => l.data.name));
  console.log(`John B's lists (${johnBLists.length}):`, johnBLists.map(l => l.data.name));
  console.log(`All creators found:`, otherUsers.sort());

  // ── 3. Delete Dan's lists ────────────────────────────────────
  for (const { id, data } of danLists) {
    await redis('DEL', `tm:list:${id}`);
    await redis('HDEL', 'tm:index', id);
    console.log(`  ✗ Deleted Dan's list: "${data.name}" (${id})`);
  }

  // ── 4. Reassign John B's lists to John ───────────────────────
  for (const { id, data } of johnBLists) {
    const updated = { ...data, creator: 'John' };
    await redis('SET', `tm:list:${id}`, JSON.stringify(updated));
    await redis('HSET', 'tm:index', id, updated.name || id);
    console.log(`  ✎ Reassigned "${data.name}" (${id}) → John`);
  }

  // ── 5. Check drafts.json for dangling references ─────────────
  const DRAFTS_FILE = path.join(__dirname, 'drafts.json');
  if (fs.existsSync(DRAFTS_FILE)) {
    const drafts = JSON.parse(fs.readFileSync(DRAFTS_FILE, 'utf8'));
    let draftsChanged = false;
    for (const [draftId, draft] of Object.entries(drafts)) {
      const hasDan   = (draft.players || []).includes('Dan')   || draft.creator === 'Dan';
      const hasJohnB = (draft.players || []).includes('John B') || draft.creator === 'John B';
      if (!hasDan && !hasJohnB) continue;

      console.log(`\nDraft ${draftId} (status=${draft.status}) references Dan/John B`);

      // Reassign John B → John everywhere in the draft
      if (hasJohnB) {
        if (draft.creator === 'John B') draft.creator = 'John';
        draft.players = (draft.players || []).map(p => p === 'John B' ? 'John' : p);
        if (draft.turnOrder) draft.turnOrder = draft.turnOrder.map(p => p === 'John B' ? 'John' : p);
        if (draft.picks?.['John B']) {
          draft.picks['John'] = (draft.picks['John'] || []).concat(draft.picks['John B']);
          delete draft.picks['John B'];
        }
        draftsChanged = true;
        console.log(`  ✎ Renamed John B → John in draft ${draftId}`);
      }

      // Remove Dan from waiting/active drafts
      if (hasDan) {
        if (draft.status === 'waiting' || draft.status === 'active') {
          draft.players = (draft.players || []).filter(p => p !== 'Dan');
          if (draft.turnOrder) draft.turnOrder = draft.turnOrder.filter(p => p !== 'Dan');
          if (draft.picks) delete draft.picks['Dan'];
          if (draft.creator === 'Dan') draft.creator = draft.players[0] || '';
          draftsChanged = true;
          console.log(`  ✎ Removed Dan from draft ${draftId} (was ${draft.status})`);
        } else {
          console.log(`  ⚠ Dan in completed/finished draft ${draftId} — left intact`);
        }
      }
    }
    if (draftsChanged) {
      fs.writeFileSync(DRAFTS_FILE, JSON.stringify(drafts, null, 2), 'utf8');
      console.log('\ndrafts.json updated.');
    }
  } else {
    console.log('\nNo local drafts.json found (production uses file on Koyeb).');
  }

  // ── 6. Final creator roster ──────────────────────────────────
  const finalIds  = await redis('HKEYS', 'tm:index');
  const finalVals = finalIds.length ? await redis('MGET', ...finalIds.map(id => `tm:list:${id}`)) : [];
  const finalCreators = [...new Set(
    finalVals.map(v => v ? JSON.parse(v).creator : null).filter(Boolean)
  )].sort();
  console.log('\n✓ Final creator roster:', finalCreators);

  const DISCORD_IDS = ['Tom','Joe','Kellen','Arye','Sam','David','John','Jack'];
  const missing = finalCreators.filter(u => !DISCORD_IDS.includes(u));
  if (missing.length) {
    console.log('⚠ Users WITHOUT Discord ID mapping:', missing);
  } else {
    console.log('✓ All creators have a Discord ID mapped.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
