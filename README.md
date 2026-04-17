# Boston Live Transit

`bostonlive.transit` — real-time 3D dark map of every MBTA subway train moving across Greater Boston, plus a live station departure board. Inspired by [londonunderground.live](https://londonunderground.live).

> Watch every MBTA train move across a 3D map of Boston, live.

Built per the **Boston Live Transit PRD v1.0**: subway-only at MVP (Red, Orange, Blue, Green B/C/D/E, Mattapan).

## Architecture

```
MBTA V3 API (SSE streams)
  ├─ /vehicles      ── GPS positions
  ├─ /predictions   ── arrival predictions
  └─ /alerts        ── service alerts
        │
        ▼
  Backend (Node + Express :3001)
  ├─ MbtaStream     — 3 persistent SSE connections to api-v3.mbta.com
  ├─ StateManager   — in-memory merge of reset/add/update/remove events
  ├─ WsBroadcaster  — fans out incremental updates to every WebSocket client
  └─ REST           — /api/shapes (GTFS), /api/stops, /health, /ready
        │
        ▼ ws://…/ws
        │
  Frontend (React + Vite :5173)
  ├─ TopBar         — bostonlive.transit wordmark + LIVE pill + MAP/BOARDS tabs
  ├─ LiveMap        — MapLibre GL + deck.gl TripsLayer (animated trains + trails)
  │   ├─ PathLayer   (dim static route tracks)
  │   └─ Scatterplot (stations + delayed-train markers)
  ├─ BoardsView     — station search, line badges, departure rows, alert banner
  └─ Footer         — attribution + sponsor slot
```

### Why this design (PRD §2.5)

- **Map fills the viewport.** The product *is* the map. No drawers, no opaque sidebars.
- **Dark theme only.** Coloured train lines pop against `#0A0A0A`.
- **deck.gl, not three.js.** Purpose-built for geospatial animated data.
- **Backend SSE → WebSocket fan-out.** One persistent connection to MBTA per stream, broadcast to all browsers.

## API keys

| Key | Where to get it |
|-----|----------------|
| `MBTA_API_KEY` | <https://api-v3.mbta.com/> — free |
| `VITE_MAPTILER_API_KEY` | <https://www.maptiler.com/> — free tier (100K tiles/mo) |

The frontend falls back to OpenFreeMap's dark style if no MapTiler key is set.

## Setup

```bash
node --version   # 20+
npm install -g pnpm   # if you don't have it
pnpm install
```

Create `backend/.env`:

```
MBTA_API_KEY=your_mbta_key_here
PORT=3001
```

Create `frontend/.env`:

```
VITE_MAPTILER_API_KEY=your_maptiler_key_here
```

## Dev

| Command | Description |
|---------|-------------|
| `pnpm dev`                  | Backend (3001) + frontend (5173) in parallel |
| `pnpm dev:backend`          | Backend only (`tsx watch`) |
| `pnpm dev:frontend`         | Frontend only (Vite) |
| `pnpm build`                | Frontend production build |
| `pnpm test`                 | All workspace tests |
| `pnpm test:backend`         | Backend only |
| `pnpm test:frontend`        | Frontend only |
| `pnpm lint`                 | Biome check across both workspaces |
| `pnpm lint:fix`             | Biome check + apply safe fixes |

Vite proxies `/api/*` and `/ws` to `localhost:3001` — no CORS setup needed in dev.

## MBTA brand colours (PRD §10)

| Line          | Hex     |
|---------------|---------|
| Red           | `#DA291C` |
| Orange        | `#ED8B00` |
| Blue          | `#003DA5` |
| Green B/C/D/E | `#00843D` |
| Mattapan      | `#DA291C` |

Never deviate — riders recognise these from station signage.

## Project layout

```
backend/src/
  index.ts          — Express + WebSocket entry
  mbta-stream.ts    — SSE client (vehicles + predictions + alerts)
  state-manager.ts  — In-memory state merge
  ws-server.ts      — WebSocket fan-out
  gtfs-loader.ts    — GTFS shape download + cache
  mbta-parser.ts    — JSON:API → typed records

frontend/src/
  components/
    TopBar.tsx, LivePill.tsx, BoardsView.tsx
    LiveMap.tsx, InteractionHint.tsx, Footer.tsx, ErrorBoundary.tsx
  overlays/
    TrainTooltip.tsx, StationTooltip.tsx, AlertBanner.tsx
  hooks/
    useSystemState.ts, useWebSocket.ts, useRouteData.ts, useTrainTrips.ts
    useMapLayers.ts, useGlobalSlashFocus.ts
  store/
    systemStore.ts      — Zustand store for vehicles/predictions/alerts
  utils/
    map-style.ts, maptiler-vintage-style.ts, debug-trips-worm.ts
    mbta-colors.ts, mbta-routes.ts, snap-to-route.ts, time-format.ts, stop-names.ts
```

### Tooling

- **Package manager:** pnpm (workspaces defined in `pnpm-workspace.yaml`).
- **Lint + format:** [Biome](https://biomejs.dev) (see `biome.json`). One tool, Rust-fast, replaces ESLint+Prettier.
- **Frontend state:** [Zustand](https://github.com/pmndrs/zustand) store in `frontend/src/store/systemStore.ts` fed by the WebSocket hook.

## Roadmap

Per PRD §13:
- **Phase 1 (MVP)** — subway live map + BOARDS page. *(this repo)*
- **Phase 2** — service-alerts overlay, Commuter Rail, line-filter toggles, share/permalink URLs.
- **Phase 3** — Ferry vessel tracking, bus layer, embeddable widget, historical playback.

## Credits

MBTA data is open and free under the MassDOT Developer License Agreement. Map tiles by MapTiler / OpenFreeMap / OpenStreetMap contributors. Spiritual successor to [londonunderground.live](https://londonunderground.live) by Ben James.
