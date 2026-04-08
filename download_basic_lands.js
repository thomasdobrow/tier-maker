'use strict';
// One-time script: download Alpha basic land art.
// Saves as basic-plains.jpg etc. to avoid conflicts with cube card filenames.
// Usage: node download_basic_lands.js

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const CARDS_DIR = path.join(__dirname, 'cards', 'vc');
const DELAY     = 120; // ms between Scryfall requests

const BASICS = [
  ['Plains',   'lea', 'basic-plains.jpg'],
  ['Island',   'lea', 'basic-island.jpg'],
  ['Swamp',    'lea', 'basic-swamp.jpg'],
  ['Mountain', 'lea', 'basic-mountain.jpg'],
  ['Forest',   'lea', 'basic-forest.jpg'],
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
  for (const [name, set, file] of BASICS) {
    const url  = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&set=${set}`;
    const dest = path.join(CARDS_DIR, file);
    try {
      const card   = await fetchJson(url);
      if (card.object === 'error') throw new Error(card.details);
      const imgUrl = card.image_uris?.normal;
      if (!imgUrl) throw new Error('no image_uris.normal');
      await downloadTo(imgUrl, dest);
      console.log(`  ✓  ${name} (${set}) → ${file}`);
      ok++;
    } catch (e) {
      console.error(`  ✗  ${name}: ${e.message}`);
      fail++;
    }
    await sleep(DELAY);
  }
  console.log(`\nDone. ${ok} downloaded, ${fail} failed.`);
}

main().catch(console.error);
