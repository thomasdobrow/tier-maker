'use strict';

// One-time migration: append 9 missing MKM surveil lands to undraftedCards
// on any draft that is not yet complete.
//
// Usage:
//   UPSTASH_REDIS_REST_URL=<url> UPSTASH_REDIS_REST_TOKEN=<token> node migrate_surveil_lands.js

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!UPSTASH_URL || !UPSTASH_TOKEN) {
  console.error('Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.');
  process.exit(1);
}

const NEW_CARDS = [
  'Meticulous Archive',
  'Shadowy Backstreet',
  'Elegant Parlor',
  'Lush Portico',
  'Undercity Sewers',
  'Hedge Maze',
  'Raucous Theater',
  'Underground Mortuary',
  'Commercial District',
];

async function redis(cmd, ...args) {
  const res = await fetch(`${UPSTASH_URL}/${[cmd, ...args].map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  const json = await res.json();
  if (json.error) throw new Error(`Redis error: ${json.error}`);
  return json.result;
}

async function main() {
  // 1. Get all draft IDs
  const ids = await redis('HKEYS', 'tm:draft-index');
  if (!ids || ids.length === 0) { console.log('No drafts found.'); return; }
  console.log(`Found ${ids.length} draft(s).`);

  // 2. Fetch all drafts
  const raw = await redis('MGET', ...ids.map(id => `tm:draft:${id}`));

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!raw[i]) { console.log(`  [${id}] empty — skip`); continue; }

    const draft = JSON.parse(raw[i]);
    const status = draft.status || 'unknown';

    if (status === 'complete') {
      console.log(`  [${id}] "${draft.name || id}" status=complete — skip`);
      continue;
    }

    // undraftedCards may not exist yet if draft hasn't started
    if (!Array.isArray(draft.undraftedCards)) {
      console.log(`  [${id}] status=${status} — no undraftedCards yet, skip`);
      continue;
    }

    // Only add cards not already present
    const toAdd = NEW_CARDS.filter(c => !draft.undraftedCards.includes(c));
    if (toAdd.length === 0) {
      console.log(`  [${id}] status=${status} — all surveil lands already present, skip`);
      continue;
    }

    draft.undraftedCards = [...draft.undraftedCards, ...toAdd];

    // Save back
    await redis('SET', `tm:draft:${id}`, JSON.stringify(draft));
    console.log(`  [${id}] status=${status} — added ${toAdd.length} card(s): ${toAdd.join(', ')}`);
  }

  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
