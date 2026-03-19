# Tier Maker

A drag-and-drop tier list tool for ranking **Vintage Cube** cards (464 cards) and **Agricola** cards (Decks A–E, ~840 cards).

## Features

- Drag cards between tiers (S / A / B / C / F) or back to the unassigned pool
- **Quick Rank mode** — work through unassigned cards one at a time; use keyboard shortcuts to assign or skip
- Zoom any card for a closer look; assign to a tier directly from zoom view
- **Sort Within a Tier** — Sort Wizard uses binary comparison to rank cards within a tier
- Sort the unassigned pool by color, CMC, shuffle, card number, occupations first, improvements first, or A→Z
- Filter the pool by deck (Agricola: A–E; Vintage Cube: color/CMC/alpha)
- Search cards by name
- Multiple named lists with save/load; all data persists in Redis
- Lock a list to prevent accidental edits
- **Compare view** — cross-list analysis for fully ranked, locked lists (see below)
- Mobile-friendly: tier rows scroll horizontally

## Compare View

Click **Compare ↔** in the toolbar to open the compare view. Only lists that are **fully ranked** (every card assigned to a tier) **and locked** are shown.

### All Cards

Every card is listed in order of average rank across all eligible lists. Each row shows:

- **Average rank** — numeric mean position across all lists
- **Card name**
- **Rank bar** — a horizontal track from `#1` (best, green-tinted left edge) to `#N` (worst, red-tinted right edge), with a colored dot per list at that card's rank position
- **Hover a dot** to see the exact rank number for that list

The legend at the top maps each color to a list.

### Head to Head

Select any two eligible lists from the dropdowns to compare their **top 10 cards** side by side as card-image thumbnails with rank-number badges.

Click **← Back** (or load any list) to return to the tier view.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| S / A / B / C / F | Assign zoomed card to that tier |
| → (right arrow) | Skip to next card (Quick Rank mode) |
| Left-hand keys (Q A Z W S X …) | Pick left card in Sort Wizard |
| Right-hand keys (P L O K M I …) | Pick right card in Sort Wizard |
| Esc | Close any open overlay |

## Stack

- Vanilla JS + HTML/CSS (no framework)
- Node.js HTTP server (`server.js`) for static files and list persistence
- Upstash Redis (REST API) for persisted tier lists
- Vintage Cube card images pre-downloaded to `cards/vc/` via `download_vc_cards.js`
- Agricola card images pre-rendered to `cards/full/` via `render_cards.js` (requires Puppeteer)
- Deployed on [Koyeb](https://koyeb.com)

## Local Development

```bash
node server.js
# open http://localhost:8765
```

## Deployment

Dockerfile-based deploy. Set these env vars in Koyeb:

```
PORT=8080
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```
