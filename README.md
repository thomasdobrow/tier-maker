# Agricola Tier Maker

A drag-and-drop tier list tool for ranking Agricola cards (Decks A–E, ~840 cards).

## Features

- Drag cards between tiers (S / A / B / C / F) or back to the unassigned pool
- **Quick Rank mode** — work through unassigned cards one at a time, dating-app style; use keyboard shortcuts to assign or skip
- Zoom any card for a closer look; assign to a tier directly from zoom view
- Sort the unassigned pool by shuffle, card number, occupations first, improvements first, or A→Z
- Filter the pool by deck (A–E)
- Search cards by name
- Multiple named lists with save/load; all data persists in Redis
- Red outline on banned/weak cards
- Mobile-friendly: tier rows scroll horizontally, toolbar scrolls right

## Keyboard shortcuts (zoom view)

| Key | Action |
|-----|--------|
| S / A / B / C / F | Assign to that tier |
| → (right arrow) | Skip to next card (Quick Rank mode) |
| Esc | Close zoom |

## Stack

- Vanilla JS + HTML/CSS (no framework)
- Node.js HTTP server (`server.js`) for static files and list persistence
- Upstash Redis (REST API) for persisted tier lists
- Deployed on [Koyeb](https://koyeb.com)

## Local development

```bash
node server.js
# open http://localhost:8765
```

Card images are pre-rendered PNGs in `cards/full/` and served statically. To re-render cards from BGA assets, run `node render_cards.js` (requires Puppeteer — dev dependency).

## Deployment

Dockerfile-based deploy. Set these env vars in Koyeb:

```
PORT=8080
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```
