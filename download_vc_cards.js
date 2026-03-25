#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ── Card list (mirrored from index.html VINTAGE_CUBE_CARDS) ──────────────────
const VINTAGE_CUBE_CARDS = [
  'Esper Sentinel','Giver of Runes','Guide of Souls','Mother of Runes','Ocelot Pride',
  'Thraben Inspector','Ajani, Nacatl Pariah','Cathar Commando','Containment Priest',
  'Intrepid Adversary','Jacked Rabbit','Lion Sash','Luminarch Aspirant',
  'Phelia, Exuberant Shepherd','Securitron Squadron','Selfless Spirit','Stoneforge Mystic',
  'Thalia, Guardian of Thraben','Voice of Victory','Adeline, Resplendent Cathar',
  'Archon of Emeria','Clarion Conqueror','Cosmogrand Zenith','Elite Spellbinder',
  'Enduring Innocence','Loran of the Third Path','Sage of the Skies','Sanguine Evangelist',
  'Skyclave Apparition','Auriok Salvagers','Dion, Bahamut\'s Dominant','Palace Jailer',
  'Serra Paragon','Witch Enchanter','Solitude','Summon: Good King Mog XII',
  'Eagles of the North','Overlord of the Mistmoors','The Wandering Emperor',
  'Elspeth, Storm Slayer','Path to Exile','Swords to Plowshares','Get Lost','Reprieve',
  'Oust','Balance','Winds of Abandon','Council\'s Judgment','Lingering Souls','Wrath of God',
  'Sunfall','Portable Hole','Glimmer Lens','Staff of the Storyteller','Parallax Wave',
  'Virtue of Loyalty','Leyline Binding',
  'Tamiyo, Inquisitive Student','Duelist of the Mind','Faerie Mastermind',
  'Goben, Gene-Splice Savant','Jace, Vryn\'s Prodigy','Kitsa, Otterball Elite',
  'Malcolm, Alluring Scoundrel','Snapcaster Mage','Suspicious Stowaway','Thassa\'s Oracle',
  'Wan Shi Tong, Librarian','Brazen Borrower','Chrome Host Seedshark','Emry, Lurker of the Loch',
  'Forensic Gadgeteer','Hullbreacher','Spellseeker','Tishana\'s Tidebinder','Displacer Kitten',
  'Urza, Lord High Artificer','Quantum Riddler','Kappa Cannoneer','Narset, Parter of Veils',
  'Jace, the Mind Sculptor','Jace, Wielder of Mysteries',
  'Ancestral Recall','Brainstorm','Mystical Tutor','Occult Epiphany','Spell Pierce',
  'Stern Scolding','Thought Scour','Brain Freeze','Counterspell','Daze','Flash','Lose Focus',
  'Mana Drain','Mana Leak','Memory Lapse','Miscalculation','Remand','Brainsurge',
  'Force of Negation','Frantic Search','Cryptic Command','Force of Will','Gush',
  'Mystic Confluence','Dig Through Time','Gitaxian Probe','Ponder','Preordain','Time Walk',
  'Stock Up','Timetwister','Tinker','L\u00f3rien Revealed','Time Warp','Echo of Eons',
  'Time Spiral','Upheaval','Aether Spellbomb','Astrologian\'s Planisphere',
  'Proft\'s Eidetic Memory','Concealing Curtains',
  'Caustic Bronco','Dark Confidant','Dauthi Voidwalker','Deep-Cavern Bat','Emperor of Bones',
  'Kitesail Freebooter','Mai, Scornful Striker','Orcish Bowmasters','Sorin of House Markov',
  'Barrowgoyf','Preacher of the Schism','Sedgemoor Witch','Grief','Sheoldred, the Apocalypse',
  'Crabomination','Metamorphosis Fanatic','Troll of Khazad-d\u00fbm','Archon of Cruelty',
  'Griselbrand','Liliana of the Veil',
  'Booster Tutor','Cut Down','Dark Ritual','Demonic Consultation','Entomb','Fatal Push',
  'Vampiric Tutor','Bitter Triumph','Cabal Ritual','Goryo\'s Vengeance','Infernal Grasp',
  'Shallow Grave','Sheoldred\'s Edict','Dismember','Baleful Mastery','Snuff Out','Bone Shards',
  'Duress','Imperial Seal','Inquisition of Kozilek','Mind Twist','Reanimate','Thoughtseize',
  'Unearth','Chain of Smog','Collective Brutality','Demonic Tutor','Exhume','Hymn to Tourach',
  'Night\'s Whisper','Doomsday','Life // Death','Toxic Deluge','Yawgmoth\'s Will','Damnation',
  'Tendrils of Agony','Wishclaw Talisman','Bolas\'s Citadel','Animate Dead','Necromancy',
  'Dragon\'s Rage Channeler','Ragavan, Nimble Pilferer','Amped Raptor','Embereth Shieldbreaker',
  'Fear of Missing Out','Gau, Feral Youth','Generous Plunderer','Inti, Seneschal of the Sun',
  'Ivora, Insatiable Heir','Magda, Brazen Outlaw','Nia, Skysail Storyteller',
  'Reckless Pyrosurfer','Robber of the Rich','Scrapwork Mutt','Slickshot Show-Off',
  'Broadside Bombardiers','Death-Greeter\'s Champion','Goblin Rabblemaster','Gut, True Soul Zealot',
  'Laelia, the Blade Reforged','Screaming Nemesis','Seasoned Pyromancer','Simian Spirit Guide',
  'Tersa Lightshatter','Emberwilde Captain','Headliner Scarlett','Pyrogoyf',
  'Bonehoard Dracosaur','Fury','Glorybringer','Oliphaunt','Trumpeting Carnosaur',
  'Etali, Primal Conqueror','Chandra, Torch of Defiance',
  'Burst Lightning','Galvanic Discharge','Lightning Bolt','Red Elemental Blast',
  'Redirect Lightning','Unholy Heat','Abrade','Mine Collapse','Through the Breach',
  'Pyrokinesis','Chain Lightning','Faithless Looting','Flame Slash','Suplex','Wheel of Fortune',
  'Fiery Confluence','Cori-Steel Cutter','Legion Extruder','Goblin Bombardment',
  'Underworld Breach','Fable of the Mirror-Breaker','Sneak Attack','The Legend of Roku',
  'Birds of Paradise','Delighted Halfling','Elvish Mystic','Hexdrinker','Ignoble Hierarch',
  'Llanowar Elves','Noble Hierarch','Sylvan Safekeeper','Badgermole Cub','Biophagus',
  'Bristly Bill, Spine Sower','Cankerbloom','Cren, Undercity Dreamer','Fanatic of Rhonas',
  'Keen-Eyed Curator','Lotus Cobra','Outland Liberator','Scythecat Cub','Springheart Nantuko',
  'Sylvan Caryatid','Tarmogoyf','Elvish Spirit Guide','Endurance','Eternal Witness',
  'Ramunap Excavator','Reclamation Sage','Sentinel of the Nameless City','Six',
  'Surrak, Elusive Hunter','Tireless Tracker','Traveling Chocobo','Ursine Monstrosity',
  'Baloth Prime','Icetill Explorer','Ouroboroid','Questing Beast','Sowing Mycospawn',
  'Ulvenwald Oddity','Titania, Protector of Argoth','Generous Ent','Primeval Titan',
  'Vaultborn Tyrant','Woodfall Primus','Worldspine Wurm','Nissa, Who Shakes the World',
  'Nissa, Ascended Animist','Crop Rotation','Once Upon a Time','Tear Asunder',
  'Green Sun\'s Zenith','Pest Infestation','Channel','Malevolent Rumble','Natural Order',
  'Esika\'s Chariot','Fastbond','Sylvan Library','Court of Garenbrig',
  'Walk-In Closet // Forgotten Cellar',
  'Walking Ballista','Cogwork Librarian','Golos, Tireless Pilgrim','Myr Battlesphere',
  'Blightsteel Colossus','Emrakul, the Aeons Torn','Triplicate Titan','Ulamog, the Infinite Gyre',
  'Tezzeret, Cruel Captain','Karn, Scion of Urza','Ugin, Eye of the Storms',
  'Black Lotus','Chrome Mox','Gleemox','Lion\'s Eye Diamond','Lotus Petal','Mana Crypt',
  'Mishra\'s Bauble','Mox Diamond','Mox Emerald','Mox Jet','Mox Opal','Mox Pearl',
  'Mox Ruby','Mox Sapphire','Urza\'s Bauble','Zuran Orb',
  'Chromatic Star','Currency Converter','Expedition Map','Ghost Vacuum','Mana Vault',
  'Manifold Key','Retrofitter Foundry','Sensei\'s Divining Top','Skullclamp','Sol Ring',
  'Soul-Guide Lantern','Chaos Orb','Grim Monolith','Lightning Greaves','Mind Stone',
  'Pentad Prism','Smuggler\'s Copter','Sword of the Meek','Talisman of Creativity',
  'Talisman of Curiosity','Talisman of Dominance','Talisman of Progress','Time Vault',
  'Umezawa\'s Jitte','Basalt Monolith','Coalition Relic','Ensnaring Bridge',
  'Palant\u00edr of Orthanc','Helm of Obedience','Relic of Sauron','The One Ring',
  'Memory Jar','The Mightstone and Weakstone','Coveted Jewel','Nexus of Becoming',
  'Kaldra Compleat','Portal to Phyrexia','Makdee and Itla, Skysnarers',
  'No More Lies','Aang, Swift Savior','Teferi, Time Raveler','Fractured Identity',
  'Teferi, Hero of Dominaria','Baleful Strix','Lim-D\u00fbl\'s Vault','Psychic Frog',
  'Kaito Shizuki','Thief of Sanity','Ertai Resurrected','Kaito, Bane of Nightmares',
  'Fallen Shinobi','Bloodtithe Harvester','Carnage Interpreter','Fire Covenant',
  'Kolaghan\'s Command','Chaos Defiler','Orcish Lumberjack','Manamorphose','Mawloc',
  'Territorial Kavu','Wrenn and Six','Minsc & Boo, Timeless Heroes','Bloodbraid Challenger',
  'Arwen, Mortal Queen','Torsten, Founder of Benalia','Tidehollow Sculler',
  'Lurrus of the Dream-Den','Expressive Iteration','Third Path Iconoclast','Dack Fayden',
  'Invert Polarity','Lutri, the Spellchaser','Saheeli, Sublime Artificer','Vivi Ornitier',
  'Fire // Ice','Deathrite Shaman','Pillage the Bog','Wight of the Reliquary',
  'Witherbloom Apprentice','Grist, the Hunger Tide','Figure of Destiny','Forth Eorlingas!',
  'Phlage, Titan of Fire\'s Fury','Zirda, the Dawnwaker','Comet, Stellar Pup',
  'Otharri, Suns\' Glory','Nadu, Winged Wisdom','Oko, Thief of Crowns',
  'Uro, Titan of Nature\'s Wrath','Tamiyo, Collector of Tales','Thopter Foundry',
  'Loot, the Pathfinder','Aragorn, King of Gondor','Leovold, Emissary of Trest',
  'Omnath, Locus of Creation','Atraxa, Grand Unifier',
  'Dryad Arbor','Celestial Colonnade','Creeping Tar Pit',
  'Blazemire Verge','Raging Ravine','Thornspire Verge','Horizon Canopy',
  'Bleachbone Verge','Fiery Islet','Riverpyre Verge',
  // Original Duals
  'Badlands','Bayou','Plateau','Savannah','Scrubland',
  'Taiga','Tropical Island','Tundra','Underground Sea','Volcanic Island',
  // Fetchlands
  'Arid Mesa','Bloodstained Mire','Flooded Strand','Marsh Flats','Misty Rainforest',
  'Polluted Delta','Scalding Tarn','Verdant Catacombs','Windswept Heath','Wooded Foothills',
  // Shocklands
  'Blood Crypt','Breeding Pool','Godless Shrine','Hallowed Fountain','Overgrown Tomb',
  'Sacred Foundry','Steam Vents','Stomping Ground','Temple Garden','Watery Grave',
  // New Duals (MKM surveil lands)
  'Thundering Falls','Meticulous Archive','Shadowy Backstreet','Elegant Parlor','Lush Portico',
  'Undercity Sewers','Hedge Maze','Raucous Theater','Underground Mortuary','Commercial District',
  // Triomes
  'Indatha Triome','Jetmir\'s Garden','Ketria Triome','Raffine\'s Tower','Raugrin Triome',
  'Savai Triome','Spara\'s Headquarters','Xander\'s Lounge','Zagoth Triome','Ziatora\'s Proving Ground',
  // Other lands
  'Nurturing Peatland','Wastewood Verge','Waterlogged Grove',
  'Mana Confluence','Multiversal Passage','Prismatic Vista','Starting Town',
  'Ancient Tomb','Arena of Glory','Bazaar of Baghdad','Boseiju, Who Endures',
  'City of Traitors','Dark Depths','Gaea\'s Cradle','Karakas','Library of Alexandria',
  'Mishra\'s Workshop','Otawara, Soaring City','Seat of the Synod','Shelldock Isle',
  'Shifting Woodland','Strip Mine','Thespian\'s Stage','Tolarian Academy',
  'Urborg, Tomb of Yawgmoth','Urza\'s Saga','Wasteland',
];

// ── Paths ─────────────────────────────────────────────────────────────────────
const OUT_DIR  = path.join(__dirname, 'cards', 'vc');
const JSON_OUT = path.join(__dirname, 'vc_cards.json');
const BATCH    = 75;   // Scryfall collection endpoint max
const DELAY_MS = 150;  // polite pause between API requests
const IMG_DELAY = 80;  // pause between image downloads

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────────────────────
function sanitize(name) {
  return name.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

// Map normalized first-face name → original VINTAGE_CUBE_CARDS entry (for DFC matching)
const normalToOriginal = {};
for (const name of VINTAGE_CUBE_CARDS) {
  const key = name.split(' // ')[0].trim().toLowerCase();
  normalToOriginal[key] = name;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent':     'VCTierMaker/1.0',
        'Accept':         'application/json',
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const attempt = (u) => {
      https.get(u, { headers: { 'User-Agent': 'VCTierMaker/1.0', 'Accept': 'application/json' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return attempt(res.headers.location);
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch (e) { reject(e); }
        });
      }).on('error', reject);
    };
    attempt(url);
  });
}

function downloadTo(url, dest) {
  return new Promise((resolve, reject) => {
    const attempt = (u) => {
      https.get(u, { headers: { 'User-Agent': 'VCTierMaker/1.0' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return attempt(res.headers.location);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => { out.close(); resolve(); });
        out.on('error', reject);
      }).on('error', reject);
    };
    attempt(url);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const vcData     = {};  // originalName → { file, cmc, colors, typeLine }
  const toDownload = [];  // { url, dest }
  const notFound   = [];

  console.log(`Fetching metadata for ${VINTAGE_CUBE_CARDS.length} cards in batches of ${BATCH}...`);

  for (let i = 0; i < VINTAGE_CUBE_CARDS.length; i += BATCH) {
    const batch = VINTAGE_CUBE_CARDS.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const totalBatches = Math.ceil(VINTAGE_CUBE_CARDS.length / BATCH);
    process.stdout.write(`  Batch ${batchNum}/${totalBatches}... `);
    try {
      const result = await postJson('https://api.scryfall.com/cards/collection', {
        identifiers: batch.map(n => ({ name: n })),
      });
      for (const card of result.data || []) {
        const firstFace  = card.name.split(' // ')[0].trim();
        const origName   = normalToOriginal[firstFace.toLowerCase()] || firstFace;
        const uri        = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal;
        const file       = sanitize(firstFace) + '.jpg';
        vcData[origName] = {
          file,
          cmc:      card.cmc ?? 0,
          colors:   card.colors ?? [],
          typeLine: card.type_line ?? '',
        };
        if (uri) toDownload.push({ url: uri, dest: path.join(OUT_DIR, file) });
      }
      for (const nf of result.not_found || []) {
        notFound.push(nf.name || JSON.stringify(nf));
      }
      console.log(`${result.data?.length ?? 0} found, ${result.not_found?.length ?? 0} not found`);
    } catch (e) {
      console.error('FAILED:', e.message);
    }
    if (i + BATCH < VINTAGE_CUBE_CARDS.length) await sleep(DELAY_MS);
  }

  // Fuzzy fallback for not-found cards
  if (notFound.length) {
    console.log(`\nFuzzy fallback for ${notFound.length} card(s): ${notFound.join(', ')}`);
    for (const name of notFound) {
      try {
        const card = await getJson(
          `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`
        );
        if (card.object === 'error') {
          console.warn(`  Not found (fuzzy): ${name}`);
          continue;
        }
        const firstFace  = card.name.split(' // ')[0].trim();
        const origName   = normalToOriginal[firstFace.toLowerCase()] || name;
        const uri        = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal;
        const file       = sanitize(firstFace) + '.jpg';
        vcData[origName] = { file, cmc: card.cmc ?? 0, colors: card.colors ?? [], typeLine: card.type_line ?? '' };
        if (uri) toDownload.push({ url: uri, dest: path.join(OUT_DIR, file) });
        console.log(`  Found via fuzzy: ${name} → ${card.name}`);
      } catch (e) {
        console.warn(`  Fuzzy failed for ${name}:`, e.message);
      }
      await sleep(DELAY_MS);
    }
  }

  // Write metadata JSON
  fs.writeFileSync(JSON_OUT, JSON.stringify(vcData, null, 2));
  console.log(`\nWrote ${Object.keys(vcData).length} entries to vc_cards.json`);

  // Download images (skip already-downloaded)
  const fresh = toDownload.filter(({ dest }) => !fs.existsSync(dest));
  const skip  = toDownload.length - fresh.length;
  console.log(`\nDownloading ${fresh.length} images to cards/vc/ (${skip} already cached)...`);
  let done = 0;
  for (const { url, dest } of fresh) {
    try {
      await downloadTo(url, dest);
      done++;
    } catch (e) {
      console.error(`\n  Failed: ${path.basename(dest)} — ${e.message}`);
    }
    if (done % 10 === 0 || done === fresh.length) {
      process.stdout.write(`\r  ${done + skip}/${toDownload.length} images done`);
    }
    await sleep(IMG_DELAY);
  }

  console.log(`\n\nAll done!\n  ${Object.keys(vcData).length} cards in vc_cards.json\n  ${toDownload.length} images in cards/vc/`);
}

main().catch(e => { console.error(e); process.exit(1); });
