# Boston Subway Live

Real-time MBTA subway tracker with smooth train animation, departure boards, and accessibility alerts.

## Architecture

```
MBTA API (SSE)
  |-- /vehicles stream
  |-- /predictions stream
  └-- /alerts stream
        |
        v
  Backend (Node/Express :3001)
  ├── MbtaStream      — opens 3 SSE connections to api-v3.mbta.com
  ├── StateManager    — merges reset/add/update/remove events into in-memory state
  ├── WsBroadcaster   — fans out incremental updates to all WebSocket clients
  ├── FacilityPoller  — polls elevator/escalator status every 60 s
  ├── WeatherPoller   — polls weather every 15 min
  └── REST endpoints  — /api/shapes (GTFS), /api/stops, /health
        |
        v (WebSocket ws://localhost:3001/ws)
        |
  Frontend (React/Vite :5173)
  ├── App.tsx          — WebSocket client, merges state slices
  ├── LiveMap.tsx      — MapLibre GL + deck.gl animation loop
  │     ├── PathLayer (train trails, lerp-interpolated)
  │     └── ScatterplotLayer (train dots + stations)
  └── DepartureBoard.tsx — searchable departure board with live countdowns
```

### SSE to WebSocket fan-out

The backend keeps a single set of SSE connections to the MBTA API. Each incoming event (add / update / remove / reset) is applied to `StateManager` and immediately re-broadcast over WebSocket to every connected browser. New clients receive a full-state snapshot on connect so they are immediately up to date without replaying history.

## API Keys

Two free API keys are required:

| Key | Where to get it |
|-----|----------------|
| `MBTA_API_KEY` | <https://api-v3.mbta.com/> — register for a free key |
| `VITE_MAPTILER_API_KEY` | <https://www.maptiler.com/> — free tier is sufficient |

## Setup

### Prerequisites

- Node.js 20+
- npm 10+

### Install

```bash
npm install
```

### Configure environment

Create `backend/.env`:

```
MBTA_API_KEY=your_mbta_key_here
PORT=3001
```

Create `frontend/.env`:

```
VITE_MAPTILER_API_KEY=your_maptiler_key_here
```

## Dev Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both backend and frontend in parallel |
| `npm run dev:backend` | Backend only (tsx watch, port 3001) |
| `npm run dev:frontend` | Frontend only (Vite, port 5173) |
| `npm test` | Run all tests (backend + frontend) |
| `npm test --workspace=backend` | Backend tests only |
| `npm test --workspace=frontend` | Frontend tests only |

The frontend Vite dev server proxies `/api/*` and `/ws` to `localhost:3001` — no CORS configuration needed during development.

## Project Structure

```
boston-subway-live/
├── backend/
│   └── src/
│       ├── index.ts           — Express server entry point
│       ├── mbta-stream.ts     — SSE client for MBTA API
│       ├── state-manager.ts   — In-memory state for vehicles/predictions/alerts
│       ├── ws-server.ts       — WebSocket broadcaster
│       ├── facility-poller.ts — Elevator/escalator status polling
│       ├── gtfs-loader.ts     — GTFS shape download and caching
│       └── mbta-parser.ts     — API response normalisation
└── frontend/
    └── src/
        ├── components/
        │   ├── LiveMap.tsx        — Animated map with deck.gl
        │   └── DepartureBoard.tsx — Station departure board
        ├── overlays/
        │   ├── TrainTooltip.tsx   — Hover tooltip on train trails
        │   └── AlertBanner.tsx    — Service alert banner
        ├── utils/
        │   ├── mbta-colors.ts     — Route colour palette
        │   ├── mbta-routes.ts     — Direction names per route
        │   ├── snap-to-route.ts   — Nearest route-point lookup
        │   └── time-format.ts     — Arrival time formatting
        └── hooks/
            └── useGeolocation.ts  — Browser geolocation hook
```
