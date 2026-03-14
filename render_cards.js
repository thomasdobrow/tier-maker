'use strict';

const puppeteer = require('puppeteer');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const BASE_DIR = '/Users/tomdobrow/Documents/tier_maker';
const ASSETS_DIR = path.join(BASE_DIR, 'bga_assets');
const CARDS_DIR = path.join(BASE_DIR, 'cards');
const OUTPUT_DIR = path.join(BASE_DIR, 'cards/full');
const CSV_FILE = '/tmp/agricola_db.csv';
const PORT = 19231;

// ----- Local HTTP server -----
// Serves BGA assets at http://localhost:PORT/
// Deck artwork is served as /img/deckA/A022.png → local .webp files
function startServer() {
  const MIME = {
    '.css': 'text/css',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.html': 'text/html',
  };

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);

    // Map deck artwork: /img/deckX/X001.png → local .webp
    const deckMatch = urlPath.match(/^\/img\/(deck[A-E]\/([A-E]\d{3}))\.png$/i);
    if (deckMatch) {
      const webpPath = path.join(CARDS_DIR, `${deckMatch[1]}.webp`);
      if (fs.existsSync(webpPath)) {
        res.writeHead(200, { 'Content-Type': 'image/webp' });
        fs.createReadStream(webpPath).pipe(res);
        return;
      }
    }

    // Serve from bga_assets directory
    const filePath = path.join(ASSETS_DIR, urlPath);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Content-Length': stat.size,
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    res.writeHead(404);
    res.end('Not found: ' + urlPath);
  });

  return new Promise((resolve, reject) => {
    server.listen(PORT, 'localhost', () => {
      console.log(`Asset server running at http://localhost:${PORT}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

// ----- Resource name → meeple CSS class -----
const RESOURCE_MAP = {
  wood: 'wood', woods: 'wood',
  clay: 'clay',
  reed: 'reed', reeds: 'reed',
  stone: 'stone', stones: 'stone',
  food: 'food',
  grain: 'grain', grains: 'grain',
  vegetable: 'vegetable', vegetables: 'vegetable',
  sheep: 'sheep',
  pig: 'pig', pigs: 'pig', boar: 'pig', boars: 'pig',
  cattle: 'cattle', cow: 'cattle', cows: 'cattle',
};

function meepleSpan(cls) {
  // Use inline-block divs to match BGA's DOM; wrap in span so they flow with text
  return `<div class="meeple-container" style="display:inline-block;vertical-align:middle"><div class="agricola-meeple meeple-${cls}" style="display:inline-block"></div></div>`;
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildCostHTML(costStr) {
  if (!costStr || !costStr.trim()) return '';
  const normalized = costStr.replace(/\u00a0/g, ' ').trim();
  const parts = normalized.split(/,|\bor\b/i).map(s => s.trim()).filter(Boolean);
  let html = '';
  for (const part of parts) {
    const m = part.match(/^(\d+)\s+(.+)$/i);
    if (m) {
      const cls = RESOURCE_MAP[m[2].trim().toLowerCase()];
      html += cls
        ? `<div>${m[1]}${meepleSpan(cls)}</div>`
        : `<div class="card-cost-text">${m[1]} ${escapeHTML(m[2])}</div>`;
    } else {
      html += `<div class="card-cost-text">${escapeHTML(part)}</div>`;
    }
  }
  return html;
}

function textToMeepleHTML(text) {
  if (!text) return '';
  text = text.replace(/\u00a0/g, ' ').trim();
  const resourcePattern = Object.keys(RESOURCE_MAP)
    .sort((a, b) => b.length - a.length)
    .join('|');
  const re = new RegExp(`\\b(${resourcePattern})\\b`, 'gi');
  const chunks = [];
  let lastIdx = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIdx) chunks.push(escapeHTML(text.slice(lastIdx, match.index)));
    const cls = RESOURCE_MAP[match[1].toLowerCase()];
    chunks.push(cls ? meepleSpan(cls) : escapeHTML(match[1]));
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) chunks.push(escapeHTML(text.slice(lastIdx)));
  return chunks.join('');
}

// ----- Card HTML builder -----
function buildCardHTML(record) {
  const deckLetter = record.Deck;
  const num = deckLetter + String(parseInt(record.Number, 10)).padStart(3, '0');
  const type = record.Type === 'Occupation' ? 'occupation' : 'minor';
  const players = String(record['Player(s)'] || '').trim();
  const dataId = `${deckLetter}${parseInt(record.Number, 10)}_${(record.Name || '').replace(/[^A-Za-z0-9]/g, '')}`;
  const prereq = (record.Prerequisites || '').trim();
  const vpRaw  = String(record.VPs || '').trim();
  const vpVal  = (vpRaw && vpRaw !== '0') ? vpRaw : '';
  const vpNeg  = vpVal.startsWith('-');

  return `<div class="player-card ${type}" data-numbering="${num}" data-id="${dataId}" data-bread="false" data-cook="false">
  <div class="player-card-resizable">
    <div class="player-card-inner">
      <div class="card-frame"></div>
      <div class="card-frame-left-leaves"></div>
      <div class="card-frame-right-leaves"></div>
      ${prereq ? `<div class="card-prerequisite"><div class="prerequisite-text">${escapeHTML(prereq)}</div></div>` : ''}
      <div class="card-icon"></div>
      <div class="card-title">${escapeHTML(record.Name || '')}</div>
      <div class="card-numbering">${num}</div>
      <div class="card-bonus-vp-counter${vpNeg ? ' vp-negative' : ''}">${escapeHTML(vpVal)}</div>
      <div class="card-players"${players ? ` data-n="${escapeHTML(players)}"` : ''}></div>
      <div class="card-deck" data-deck="${deckLetter}"></div>
      <div class="card-category"></div>
      <div class="card-cost">${buildCostHTML(record.Cost || '')}</div>
      <div class="card-desc">
        <div class="card-desc-scroller">
          <div>${textToMeepleHTML(record.Text || '')}</div>
        </div>
      </div>
      <div class="card-bottom-left-corner"></div>
      <div class="card-bottom-right-corner"></div>
    </div>
  </div>
</div>`;
}

// ----- Page template (loaded once) -----
const PAGE_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="http://localhost:${PORT}/agricola.css">
<style>
html, body { margin: 0; padding: 0; background: transparent; }
.player-card { display: inline-block; position: relative; }
/* Negative VP: suppress the CSS-generated "+" prefix */
.card-bonus-vp-counter.vp-negative:before { content: "" !important; }
/* Lighten the text area (action_frame_bg.jpg is missing from local assets) */
.card-desc {
  background-image: none !important;
  background-color: rgba(232, 203, 138, 0.88) !important;
}
/* Render cards at natural 235×374 size (no BGA scaling) */
.player-card-resizable {
  width: 235px !important;
  height: 374px !important;
  transform: none !important;
}
.player-card-inner {
  width: 235px !important;
  height: 374px !important;
}
</style>
</head>
<body>
<div id="wrapper"></div>
</body>
</html>`;

// ----- Main -----
async function main() {
  const server = await startServer();

  console.log('Loading CSV...');
  const csvContent = fs.readFileSync(CSV_FILE, 'utf8');
  const records = parse(csvContent, { columns: true, skip_empty_lines: true });
  const cards = records.filter(r =>
    r.Edition === 'Revised' &&
    ['A', 'B', 'C', 'D', 'E'].includes(r.Deck) &&
    parseInt(r.Number, 10) >= 1 &&
    parseInt(r.Number, 10) <= 168
  );
  console.log(`Found ${cards.length} Revised Edition cards (A–E, 1–168)`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const existing = new Set(
    fs.readdirSync(OUTPUT_DIR)
      .filter(f => f.endsWith('.png'))
      .map(f => f.replace('.png', ''))
  );
  const toRender = cards.filter(r => {
    const num = r.Deck + String(parseInt(r.Number, 10)).padStart(3, '0');
    return !existing.has(num);
  });
  console.log(`${existing.size} already done, ${toRender.length} to render`);

  if (toRender.length === 0) {
    console.log('All cards already rendered!');
    server.close();
    return;
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 280, height: 420 });

  console.log('Loading page template with CSS...');
  await page.setContent(PAGE_TEMPLATE, { waitUntil: 'networkidle0', timeout: 30000 });
  console.log('CSS loaded. Starting render...');

  let rendered = 0;
  const total = toRender.length;
  const startTime = Date.now();

  for (const record of toRender) {
    const num = record.Deck + String(parseInt(record.Number, 10)).padStart(3, '0');
    const outPath = path.join(OUTPUT_DIR, `${num}.png`);

    try {
      const cardHTML = buildCardHTML(record);
      await page.evaluate((html) => {
        document.getElementById('wrapper').innerHTML = html;
      }, cardHTML);

      // Brief pause for CSS/images to settle
      await new Promise(r => setTimeout(r, 60));

      const el = await page.$('.player-card-inner');
      if (el) {
        await el.screenshot({ path: outPath });
        rendered++;
      } else {
        console.warn(`  WARN: no .player-card-inner for ${num}`);
      }
    } catch (err) {
      console.error(`  ERROR ${num}: ${err.message}`);
    }

    if ((rendered) % 50 === 0 && rendered > 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = rendered / elapsed;
      const remaining = total - rendered;
      console.log(`  ${rendered}/${total} | ${rate.toFixed(1)} cards/s | ~${(remaining / rate).toFixed(0)}s left`);
    }
  }

  await browser.close();
  server.close();

  console.log(`\nDone! Rendered ${rendered} cards.`);
  const finalCount = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.png')).length;
  console.log(`Total in ${OUTPUT_DIR}: ${finalCount} PNGs`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
