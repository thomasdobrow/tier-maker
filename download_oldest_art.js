'use strict';
// One-time script: download oldest-printing art for fetches, duals, and shocks.
// Overwrites existing .jpg files in cards/vc/ — no changes to vc_cards.json.
// Usage: node download_oldest_art.js

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const CARDS_DIR = path.join(__dirname, 'cards', 'vc');
const DELAY     = 120; // ms between Scryfall requests

const OLDEST_ART = [
  // ── Original Duals (Alpha, lea) ──────────────────────────────
  ['Badlands',        'lea', 'badlands.jpg'],
  ['Bayou',           'lea', 'bayou.jpg'],
  ['Plateau',         'lea', 'plateau.jpg'],
  ['Savannah',        'lea', 'savannah.jpg'],
  ['Scrubland',       'lea', 'scrubland.jpg'],
  ['Taiga',           'lea', 'taiga.jpg'],
  ['Tropical Island', 'lea', 'tropical-island.jpg'],
  ['Tundra',          'lea', 'tundra.jpg'],
  ['Underground Sea', 'lea', 'underground-sea.jpg'],
  ['Volcanic Island', 'lea', 'volcanic-island.jpg'],
  // ── Onslaught Fetch Lands (ons) ──────────────────────────────
  ['Bloodstained Mire', 'ons', 'bloodstained-mire.jpg'],
  ['Flooded Strand',    'ons', 'flooded-strand.jpg'],
  ['Polluted Delta',    'ons', 'polluted-delta.jpg'],
  ['Windswept Heath',   'ons', 'windswept-heath.jpg'],
  ['Wooded Foothills',  'ons', 'wooded-foothills.jpg'],
  // ── Zendikar Fetch Lands (zen) ───────────────────────────────
  ['Arid Mesa',         'zen', 'arid-mesa.jpg'],
  ['Marsh Flats',       'zen', 'marsh-flats.jpg'],
  ['Misty Rainforest',  'zen', 'misty-rainforest.jpg'],
  ['Scalding Tarn',     'zen', 'scalding-tarn.jpg'],
  ['Verdant Catacombs', 'zen', 'verdant-catacombs.jpg'],
  // ── Shock Lands — Ravnica: City of Guilds (rav) ──────────────
  ['Overgrown Tomb', 'rav', 'overgrown-tomb.jpg'],
  ['Sacred Foundry', 'rav', 'sacred-foundry.jpg'],
  ['Temple Garden',  'rav', 'temple-garden.jpg'],
  ['Watery Grave',   'rav', 'watery-grave.jpg'],
  // ── Shock Lands — Guildpact (gpt) ────────────────────────────
  ['Godless Shrine',  'gpt', 'godless-shrine.jpg'],
  ['Steam Vents',     'gpt', 'steam-vents.jpg'],
  ['Stomping Ground', 'gpt', 'stomping-ground.jpg'],
  // ── Shock Lands — Dissension (dis) ───────────────────────────
  ['Blood Crypt',       'dis', 'blood-crypt.jpg'],
  ['Breeding Pool',     'dis', 'breeding-pool.jpg'],
  ['Hallowed Fountain', 'dis', 'hallowed-fountain.jpg'],
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'tier-maker-art/1.0', 'Accept': 'application/json' } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks))); } catch(e) { reject(e); } });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function downloadTo(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = u => {
      https.get(u, { headers: { 'User-Agent': 'tier-maker-art/1.0' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400) return follow(res.headers.location);
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => out.close(resolve));
        out.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

async function main() {
  let ok = 0, fail = 0;
  for (const [name, set, file] of OLDEST_ART) {
    const url  = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&set=${set}`;
    const dest = path.join(CARDS_DIR, file);
    try {
      const card   = await fetchJson(url);
      if (card.object === 'error') throw new Error(card.details);
      const imgUrl = card.image_uris?.normal;
      if (!imgUrl) throw new Error('no image_uris.normal');
      await downloadTo(imgUrl, dest);
      console.log(`  ✓  ${name} (${set})`);
      ok++;
    } catch (e) {
      console.error(`  ✗  ${name} (${set}): ${e.message}`);
      fail++;
    }
    await sleep(DELAY);
  }
  console.log(`\nDone. ${ok} updated, ${fail} failed.`);
}

main().catch(console.error);
