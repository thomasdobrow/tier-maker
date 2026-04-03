// Requires: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in env
// Run: node -r dotenv/config create_pick_order_list.js
// (or set env vars manually before running)

const DRAFT_ID = 'mn28qdknvh0px';
const LIST_NAME = 'Rotisserie Pick Order';

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

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

function getSnakeDraftPlayer(turnOrder, idx) {
  const n     = turnOrder.length;
  const round = Math.floor(idx / n);
  const pos   = idx % n;
  return turnOrder[round % 2 === 0 ? pos : n - 1 - pos];
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Cards excluded from normal ranking (non-rankable lands)
const DRAFT_ONLY_LAND_NAMES = new Set([
  'Bayou','Plateau','Savannah','Scrubland','Taiga',
  'Tropical Island','Tundra','Underground Sea','Volcanic Island',
  'Bloodstained Mire','Flooded Strand','Marsh Flats','Misty Rainforest',
  'Polluted Delta','Scalding Tarn','Verdant Catacombs','Windswept Heath','Wooded Foothills',
  'Breeding Pool','Godless Shrine','Hallowed Fountain','Overgrown Tomb',
  'Sacred Foundry','Steam Vents','Stomping Ground','Temple Garden','Watery Grave',
  'Indatha Triome',"Jetmir's Garden",'Ketria Triome',"Raffine's Tower",
  'Raugrin Triome','Savai Triome',"Spara's Headquarters",'Zagoth Triome',"Ziatora's Proving Ground",
  'Meticulous Archive','Shadowy Backstreet','Elegant Parlor','Lush Portico',
  'Undercity Sewers','Hedge Maze','Raucous Theater','Underground Mortuary','Commercial District',
]);

async function main() {
  // 1. Fetch the draft from Redis
  const raw = await redis('GET', `tm:draft:${DRAFT_ID}`);
  if (!raw) throw new Error(`Draft ${DRAFT_ID} not found in Redis`);
  const draft = JSON.parse(raw);
  console.log('Draft found:', draft.status, '— players:', draft.players?.join(', '));

  // 2. Reconstruct global pick order (snake draft)
  const { turnOrder, picks } = draft;
  const totalPicks = Object.values(picks).reduce((s, arr) => s + arr.length, 0);
  const pointers   = {};
  for (const p of Object.keys(picks)) pointers[p] = 0;

  const pickOrder = [];
  for (let i = 0; i < totalPicks; i++) {
    const player = getSnakeDraftPlayer(turnOrder, i);
    const card   = picks[player]?.[pointers[player]];
    if (card) {
      pointers[player]++;
      if (!DRAFT_ONLY_LAND_NAMES.has(card)) pickOrder.push(card);
    }
  }
  console.log(`Pick order reconstructed: ${pickOrder.length} rankable cards`);

  // 3. Find existing list by name (so re-runs update in place, not create duplicates)
  const indexEntries = await redis('HGETALL', 'tm:index');
  let existingId = null;
  if (indexEntries) {
    // HGETALL returns [key, value, key, value, ...]
    for (let i = 0; i < indexEntries.length; i += 2) {
      if (indexEntries[i + 1] === LIST_NAME) { existingId = indexEntries[i]; break; }
    }
  }

  // 4. Build the list object — all cards in S tier in pick order
  const id  = existingId || generateId();
  const now = new Date().toISOString();
  const existingRaw = existingId ? await redis('GET', `tm:list:${existingId}`) : null;
  const existing    = existingRaw ? JSON.parse(existingRaw) : null;
  const list = {
    id, name: LIST_NAME, creator: '', type: 'vintage_cube',
    locked: false,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    state: {
      tiers: { S: pickOrder, A: [], B: [], C: [], F: [] },
      sortedAt: {},
    },
  };

  // 5. Save to Redis
  await Promise.all([
    redis('SET', `tm:list:${id}`, JSON.stringify(list)),
    redis('HSET', 'tm:index', id, LIST_NAME),
  ]);
  console.log(`List "${LIST_NAME}" ${existingId ? 'updated' : 'created'} (id: ${id}) — ${pickOrder.length} cards`);
}

main().catch(err => { console.error(err); process.exit(1); });
