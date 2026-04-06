# Boston Subway Live — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time 3D map showing MBTA subway trains moving across Boston, matching the visual style of londonunderground.live with added accessibility/alert features.

**Architecture:** Node.js backend connects to MBTA V3 SSE stream, aggregates vehicle/prediction/alert/facility state, and fans out diffs via WebSocket to a React frontend. Frontend uses deck.gl + MapTiler GL JS for 3D map rendering with animated polyline train trails.

**Tech Stack:** Node 20, TypeScript, Express, ws (WebSocket), EventSource; Vite, React 18, deck.gl, react-map-gl, MapTiler GL JS; Vitest for testing; npm workspaces monorepo.

---

## File Structure

```
MBTA/
├── package.json                     # Root workspace config
├── tsconfig.base.json               # Shared TS config
├── .env.example                     # MBTA_API_KEY, MAPTILER_API_KEY
├── .gitignore
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                 # Express server + health check + WS attach
│   │   ├── mbta-stream.ts           # SSE connection to MBTA V3 API
│   │   ├── mbta-parser.ts           # Parse JSON:API responses into our types
│   │   ├── state-manager.ts         # Unified state + diff computation
│   │   ├── ws-server.ts             # WebSocket fan-out to browsers
│   │   ├── facility-poller.ts       # Polls /facilities endpoint
│   │   ├── weather-poller.ts        # Polls NWS API
│   │   ├── gtfs-loader.ts           # Loads + decodes GTFS shape polylines
│   │   └── types.ts                 # Shared backend types
│   ├── test/
│   │   ├── mbta-parser.test.ts
│   │   ├── state-manager.test.ts
│   │   ├── gtfs-loader.test.ts
│   │   └── facility-poller.test.ts
│   └── data/
│       └── gtfs/                    # Cached GTFS static files (shapes, stops)
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── public/
│   │   └── favicon.ico
│   ├── src/
│   │   ├── main.tsx                 # React entry point
│   │   ├── types.ts                 # Shared frontend types (mirrors backend)
│   │   │
│   │   ├── components/
│   │   │   ├── App.tsx              # Root: nav + view switching
│   │   │   ├── LiveMap.tsx          # Main 3D map view
│   │   │   ├── DepartureBoard.tsx   # BOARDS view
│   │   │   ├── NavBar.tsx           # MAP | BOARDS | accessibility toggle
│   │   │   └── LiveIndicator.tsx    # Pulsing "LIVE" badge
│   │   │
│   │   ├── layers/
│   │   │   ├── RouteLayer.ts        # Colored track paths
│   │   │   ├── StationLayer.ts      # Station dots
│   │   │   ├── TrainLayer.ts        # Animated polyline trails
│   │   │   ├── AlertLayer.ts        # Grayed shutdown segments
│   │   │   └── AccessibilityLayer.ts # Pulsing red dots
│   │   │
│   │   ├── overlays/
│   │   │   ├── TrainTooltip.tsx     # Hover tooltip
│   │   │   ├── StationPopup.tsx     # Click popup
│   │   │   └── AlertBanner.tsx      # System-wide alert banner
│   │   │
│   │   ├── board/
│   │   │   ├── BoardHeader.tsx      # Station name + selector
│   │   │   ├── BoardLine.tsx        # Per-line arrival rows
│   │   │   └── BoardAlerts.tsx      # Alert + accessibility info
│   │   │
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts      # WS connection + reconnect
│   │   │   ├── useSystemState.ts    # Client state from WS diffs
│   │   │   ├── useTrainPositions.ts # Snap GPS to track, build trails
│   │   │   └── useGeolocation.ts    # Browser geolocation
│   │   │
│   │   ├── utils/
│   │   │   ├── snap-to-route.ts     # Snap GPS coords to nearest track point
│   │   │   ├── trail-builder.ts     # Build polyline trail behind train head
│   │   │   ├── polyline-decoder.ts  # Decode Google encoded polylines
│   │   │   ├── mbta-colors.ts       # Official MBTA line colors
│   │   │   └── time-format.ts       # "3 min", "Arriving", "Delayed" logic
│   │   │
│   │   └── styles/
│   │       ├── global.css           # Dark theme base
│   │       ├── tooltip.css          # Train tooltip
│   │       ├── board.css            # Departure board LED-style
│   │       └── nav.css              # Minimal nav bar
│   │
│   └── test/
│       ├── utils/
│       │   ├── snap-to-route.test.ts
│       │   ├── trail-builder.test.ts
│       │   ├── polyline-decoder.test.ts
│       │   └── time-format.test.ts
│       └── components/
│           └── NavBar.test.tsx
│
└── docs/
    └── superpowers/
        └── plans/
            └── 2026-04-06-boston-subway-live.md  # This file
```

---

## Phase 1: Project Setup + Backend Core

### Task 1: Environment Setup

**Files:**
- Create: `package.json` (root)
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`

- [ ] **Step 1: Install Node.js via nvm**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
node --version  # Expected: v20.x.x
```

- [ ] **Step 2: Initialize root workspace**

```bash
cd ~/MBTA
```

Write `package.json`:

```json
{
  "name": "boston-subway-live",
  "private": true,
  "workspaces": ["backend", "frontend"],
  "scripts": {
    "dev:backend": "npm run dev --workspace=backend",
    "dev:frontend": "npm run dev --workspace=frontend",
    "dev": "npm run dev:backend & npm run dev:frontend",
    "test": "npm test --workspaces",
    "test:backend": "npm test --workspace=backend",
    "test:frontend": "npm test --workspace=frontend"
  }
}
```

Write `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

Write `.gitignore`:

```
node_modules/
dist/
.env
*.log
.DS_Store
```

Write `.env.example`:

```
MBTA_API_KEY=your_mbta_api_key_here
MAPTILER_API_KEY=your_maptiler_api_key_here
```

- [ ] **Step 3: Scaffold backend package**

Write `backend/package.json`:

```json
{
  "name": "backend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "eventsource": "^2.0.2",
    "express": "^4.21.0",
    "ws": "^8.17.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/ws": "^8.5.10",
    "tsx": "^4.11.0",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

Write `backend/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["test/**/*"]
}
```

- [ ] **Step 4: Scaffold frontend package**

Write `frontend/package.json`:

```json
{
  "name": "frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@deck.gl/core": "^9.0.20",
    "@deck.gl/layers": "^9.0.20",
    "@deck.gl/geo-layers": "^9.0.20",
    "@deck.gl/react": "^9.0.20",
    "maplibre-gl": "^4.5.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-map-gl": "^7.1.7"
  },
  "devDependencies": {
    "@testing-library/react": "^15.0.7",
    "@testing-library/jest-dom": "^6.4.5",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^24.1.0",
    "typescript": "^5.4.5",
    "vite": "^5.2.12",
    "vitest": "^1.6.0"
  }
}
```

Write `frontend/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": "src",
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*"],
  "exclude": ["test/**/*"]
}
```

Write `frontend/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
  },
});
```

Write `frontend/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Boston Subway Live</title>
    <link rel="icon" href="/favicon.ico" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Install dependencies**

```bash
cd ~/MBTA
npm install
```

Expected: `node_modules/` created at root with hoisted deps.

- [ ] **Step 6: Verify both workspaces compile**

```bash
cd ~/MBTA
npx --workspace=backend tsc --noEmit --pretty 2>&1 | head -5
# Expected: no errors (no source files yet, clean exit)
```

- [ ] **Step 7: Commit**

```bash
cd ~/MBTA
git add -A
git commit -m "chore: scaffold monorepo with backend + frontend workspaces"
```

---

### Task 2: Backend Types

**Files:**
- Create: `backend/src/types.ts`

- [ ] **Step 1: Write the shared backend types**

These types match the MBTA V3 API response structures we'll parse into.

```typescript
// backend/src/types.ts

export interface Vehicle {
  id: string;
  routeId: string;           // "Red", "Orange", "Blue", "Green-B", etc.
  latitude: number;
  longitude: number;
  bearing: number;
  currentStatus: 'IN_TRANSIT_TO' | 'STOPPED_AT' | 'INCOMING_AT';
  stopId: string;
  directionId: number;       // 0 or 1
  label: string;             // train number / car label
  updatedAt: string;         // ISO timestamp
}

export interface Prediction {
  id: string;
  routeId: string;
  stopId: string;
  directionId: number;
  arrivalTime: string | null;    // ISO timestamp
  departureTime: string | null;  // ISO timestamp
  status: string | null;
  tripId: string;
  vehicleId: string | null;
  stopSequence: number;
}

export interface Alert {
  id: string;
  effect: string;               // "SHUTTLE", "SUSPENSION", "DELAY", etc.
  cause: string;
  header: string;
  description: string;
  severity: number;
  lifecycle: string;            // "ONGOING", "UPCOMING", etc.
  activePeriod: { start: string; end: string | null }[];
  informedEntities: {
    routeId: string | null;
    stopId: string | null;
    directionId: number | null;
    routeType: number | null;
    activities: string[];
  }[];
  updatedAt: string;
}

export interface Facility {
  id: string;
  longName: string;
  shortName: string;
  type: 'ELEVATOR' | 'ESCALATOR';
  stopId: string;
  latitude: number | null;
  longitude: number | null;
}

export interface FacilityStatus {
  facilityId: string;
  status: 'WORKING' | 'OUT_OF_ORDER';
  updatedAt: string;
}

export interface Weather {
  temperature: number;
  condition: string;
  icon: string;
}

export interface SystemState {
  vehicles: Map<string, Vehicle>;
  predictions: Map<string, Prediction[]>;   // stopId -> predictions
  alerts: Alert[];
  facilities: Map<string, Facility>;
  facilityStatuses: Map<string, FacilityStatus>;
  weather: Weather | null;
}

// WebSocket message types
export type WsMessageType =
  | 'full-state'
  | 'vehicles-update'
  | 'predictions-update'
  | 'alerts-update'
  | 'facilities-update'
  | 'weather-update';

export interface WsMessage {
  type: WsMessageType;
  data: unknown;
  timestamp: number;
}

// MBTA JSON:API raw types (for parsing)
export interface MbtaJsonApiResponse {
  data: MbtaResource | MbtaResource[];
  included?: MbtaResource[];
}

export interface MbtaResource {
  type: string;
  id: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, { data: { type: string; id: string } | null }>;
}

// SSE event types from MBTA
export interface MbtaSseEvent {
  event: 'reset' | 'add' | 'update' | 'remove';
  data: MbtaJsonApiResponse;
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd ~/MBTA
npx --workspace=backend tsc --noEmit
```

Expected: clean exit, no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/types.ts
git commit -m "feat(backend): add shared type definitions for MBTA data"
```

---

### Task 3: MBTA JSON:API Parser

**Files:**
- Create: `backend/src/mbta-parser.ts`
- Create: `backend/test/mbta-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/test/mbta-parser.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseVehicle,
  parsePrediction,
  parseAlert,
  parseFacility,
} from '../src/mbta-parser.js';

describe('parseVehicle', () => {
  it('parses a MBTA JSON:API vehicle resource into our Vehicle type', () => {
    const raw = {
      type: 'vehicle',
      id: 'y1234',
      attributes: {
        latitude: 42.3555,
        longitude: -71.0565,
        bearing: 180,
        current_status: 'IN_TRANSIT_TO',
        direction_id: 0,
        label: '1234',
        updated_at: '2026-04-06T12:00:00-04:00',
        current_stop_sequence: 5,
        occupancy_status: null,
        revenue: 'REVENUE',
        speed: null,
      },
      relationships: {
        route: { data: { type: 'route', id: 'Red' } },
        stop: { data: { type: 'stop', id: 'place-pktrm' } },
        trip: { data: { type: 'trip', id: '12345' } },
      },
    };

    const vehicle = parseVehicle(raw);

    expect(vehicle).toEqual({
      id: 'y1234',
      routeId: 'Red',
      latitude: 42.3555,
      longitude: -71.0565,
      bearing: 180,
      currentStatus: 'IN_TRANSIT_TO',
      stopId: 'place-pktrm',
      directionId: 0,
      label: '1234',
      updatedAt: '2026-04-06T12:00:00-04:00',
    });
  });

  it('handles null stop relationship', () => {
    const raw = {
      type: 'vehicle',
      id: 'y9999',
      attributes: {
        latitude: 42.36,
        longitude: -71.06,
        bearing: 90,
        current_status: 'STOPPED_AT',
        direction_id: 1,
        label: '9999',
        updated_at: '2026-04-06T12:05:00-04:00',
        current_stop_sequence: 1,
        occupancy_status: null,
        revenue: 'REVENUE',
        speed: null,
      },
      relationships: {
        route: { data: { type: 'route', id: 'Orange' } },
        stop: { data: null },
        trip: { data: { type: 'trip', id: '99999' } },
      },
    };

    const vehicle = parseVehicle(raw);
    expect(vehicle.stopId).toBe('');
    expect(vehicle.routeId).toBe('Orange');
  });
});

describe('parsePrediction', () => {
  it('parses a MBTA prediction resource', () => {
    const raw = {
      type: 'prediction',
      id: 'prediction-12345',
      attributes: {
        arrival_time: '2026-04-06T12:10:00-04:00',
        departure_time: '2026-04-06T12:10:30-04:00',
        direction_id: 0,
        stop_sequence: 5,
        status: null,
        schedule_relationship: null,
        arrival_uncertainty: null,
        departure_uncertainty: null,
        last_trip: false,
        revenue: 'REVENUE',
        update_type: null,
      },
      relationships: {
        route: { data: { type: 'route', id: 'Red' } },
        stop: { data: { type: 'stop', id: 'place-pktrm' } },
        trip: { data: { type: 'trip', id: 'trip-100' } },
        vehicle: { data: { type: 'vehicle', id: 'y1234' } },
      },
    };

    const prediction = parsePrediction(raw);

    expect(prediction).toEqual({
      id: 'prediction-12345',
      routeId: 'Red',
      stopId: 'place-pktrm',
      directionId: 0,
      arrivalTime: '2026-04-06T12:10:00-04:00',
      departureTime: '2026-04-06T12:10:30-04:00',
      status: null,
      tripId: 'trip-100',
      vehicleId: 'y1234',
      stopSequence: 5,
    });
  });

  it('handles null vehicle and times', () => {
    const raw = {
      type: 'prediction',
      id: 'prediction-99',
      attributes: {
        arrival_time: null,
        departure_time: null,
        direction_id: 1,
        stop_sequence: 1,
        status: 'Arriving',
        schedule_relationship: null,
        arrival_uncertainty: null,
        departure_uncertainty: null,
        last_trip: false,
        revenue: 'REVENUE',
        update_type: null,
      },
      relationships: {
        route: { data: { type: 'route', id: 'Blue' } },
        stop: { data: { type: 'stop', id: 'place-wondl' } },
        trip: { data: { type: 'trip', id: 'trip-200' } },
        vehicle: { data: null },
      },
    };

    const prediction = parsePrediction(raw);
    expect(prediction.arrivalTime).toBeNull();
    expect(prediction.vehicleId).toBeNull();
    expect(prediction.status).toBe('Arriving');
  });
});

describe('parseAlert', () => {
  it('parses a MBTA alert resource', () => {
    const raw = {
      type: 'alert',
      id: 'alert-500',
      attributes: {
        effect: 'SHUTTLE',
        cause: 'MAINTENANCE',
        header: 'Red Line shuttle buses',
        description: 'Shuttle buses replacing Red Line service between Harvard and Alewife.',
        severity: 7,
        lifecycle: 'ONGOING',
        active_period: [
          { start: '2026-04-06T05:00:00-04:00', end: '2026-04-06T23:00:00-04:00' },
        ],
        informed_entity: [
          {
            route: 'Red',
            route_type: 1,
            stop: 'place-harvd',
            direction_id: null,
            activities: ['BOARD', 'EXIT', 'RIDE'],
          },
        ],
        updated_at: '2026-04-06T08:00:00-04:00',
        created_at: '2026-04-06T04:00:00-04:00',
        banner: null,
        url: null,
        short_header: 'Red Line shuttle',
        service_effect: 'Red Line shuttle service',
        timeframe: null,
        duration_certainty: 'KNOWN',
        image: null,
        image_alternative_text: null,
        closed_timestamp: null,
        last_push_notification_timestamp: null,
        reminder_times: null,
      },
      relationships: {},
    };

    const alert = parseAlert(raw);

    expect(alert).toEqual({
      id: 'alert-500',
      effect: 'SHUTTLE',
      cause: 'MAINTENANCE',
      header: 'Red Line shuttle buses',
      description: 'Shuttle buses replacing Red Line service between Harvard and Alewife.',
      severity: 7,
      lifecycle: 'ONGOING',
      activePeriod: [
        { start: '2026-04-06T05:00:00-04:00', end: '2026-04-06T23:00:00-04:00' },
      ],
      informedEntities: [
        {
          routeId: 'Red',
          stopId: 'place-harvd',
          directionId: null,
          routeType: 1,
          activities: ['BOARD', 'EXIT', 'RIDE'],
        },
      ],
      updatedAt: '2026-04-06T08:00:00-04:00',
    });
  });
});

describe('parseFacility', () => {
  it('parses a MBTA facility resource', () => {
    const raw = {
      type: 'facility',
      id: 'facility-elevator-123',
      attributes: {
        long_name: 'Park Street Elevator 823',
        short_name: 'Elevator 823',
        type: 'ELEVATOR',
        latitude: 42.3564,
        longitude: -71.0624,
        properties: [],
      },
      relationships: {
        stop: { data: { type: 'stop', id: 'place-pktrm' } },
      },
    };

    const facility = parseFacility(raw);

    expect(facility).toEqual({
      id: 'facility-elevator-123',
      longName: 'Park Street Elevator 823',
      shortName: 'Elevator 823',
      type: 'ELEVATOR',
      stopId: 'place-pktrm',
      latitude: 42.3564,
      longitude: -71.0624,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/MBTA
npm test --workspace=backend
```

Expected: FAIL — cannot find module `../src/mbta-parser.js`

- [ ] **Step 3: Write the parser implementation**

```typescript
// backend/src/mbta-parser.ts
import type { Vehicle, Prediction, Alert, Facility, MbtaResource } from './types.js';

export function parseVehicle(resource: MbtaResource): Vehicle {
  const attrs = resource.attributes;
  const rels = resource.relationships ?? {};

  return {
    id: resource.id,
    routeId: rels.route?.data?.id ?? '',
    latitude: attrs.latitude as number,
    longitude: attrs.longitude as number,
    bearing: (attrs.bearing as number) ?? 0,
    currentStatus: attrs.current_status as Vehicle['currentStatus'],
    stopId: rels.stop?.data?.id ?? '',
    directionId: attrs.direction_id as number,
    label: (attrs.label as string) ?? '',
    updatedAt: attrs.updated_at as string,
  };
}

export function parsePrediction(resource: MbtaResource): Prediction {
  const attrs = resource.attributes;
  const rels = resource.relationships ?? {};

  return {
    id: resource.id,
    routeId: rels.route?.data?.id ?? '',
    stopId: rels.stop?.data?.id ?? '',
    directionId: attrs.direction_id as number,
    arrivalTime: (attrs.arrival_time as string) ?? null,
    departureTime: (attrs.departure_time as string) ?? null,
    status: (attrs.status as string) ?? null,
    tripId: rels.trip?.data?.id ?? '',
    vehicleId: rels.vehicle?.data?.id ?? null,
    stopSequence: attrs.stop_sequence as number,
  };
}

export function parseAlert(resource: MbtaResource): Alert {
  const attrs = resource.attributes;
  const rawEntities = (attrs.informed_entity as Array<Record<string, unknown>>) ?? [];

  return {
    id: resource.id,
    effect: attrs.effect as string,
    cause: attrs.cause as string,
    header: attrs.header as string,
    description: (attrs.description as string) ?? '',
    severity: attrs.severity as number,
    lifecycle: attrs.lifecycle as string,
    activePeriod: (attrs.active_period as Alert['activePeriod']) ?? [],
    informedEntities: rawEntities.map((e) => ({
      routeId: (e.route as string) ?? null,
      stopId: (e.stop as string) ?? null,
      directionId: (e.direction_id as number) ?? null,
      routeType: (e.route_type as number) ?? null,
      activities: (e.activities as string[]) ?? [],
    })),
    updatedAt: attrs.updated_at as string,
  };
}

export function parseFacility(resource: MbtaResource): Facility {
  const attrs = resource.attributes;
  const rels = resource.relationships ?? {};

  return {
    id: resource.id,
    longName: attrs.long_name as string,
    shortName: attrs.short_name as string,
    type: attrs.type as Facility['type'],
    stopId: rels.stop?.data?.id ?? '',
    latitude: (attrs.latitude as number) ?? null,
    longitude: (attrs.longitude as number) ?? null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/MBTA
npm test --workspace=backend
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/mbta-parser.ts backend/test/mbta-parser.test.ts
git commit -m "feat(backend): add MBTA JSON:API response parsers with tests"
```

---

### Task 4: State Manager

**Files:**
- Create: `backend/src/state-manager.ts`
- Create: `backend/test/state-manager.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/test/state-manager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { StateManager } from '../src/state-manager.js';
import type { Vehicle, Prediction, Alert } from '../src/types.js';

describe('StateManager', () => {
  let manager: StateManager;

  beforeEach(() => {
    manager = new StateManager();
  });

  describe('vehicles', () => {
    const vehicle1: Vehicle = {
      id: 'y1234',
      routeId: 'Red',
      latitude: 42.3555,
      longitude: -71.0565,
      bearing: 180,
      currentStatus: 'IN_TRANSIT_TO',
      stopId: 'place-pktrm',
      directionId: 0,
      label: '1234',
      updatedAt: '2026-04-06T12:00:00-04:00',
    };

    const vehicle2: Vehicle = {
      id: 'y5678',
      routeId: 'Orange',
      latitude: 42.365,
      longitude: -71.062,
      bearing: 0,
      currentStatus: 'STOPPED_AT',
      stopId: 'place-dwnxg',
      directionId: 1,
      label: '5678',
      updatedAt: '2026-04-06T12:01:00-04:00',
    };

    it('resets vehicles and returns full set', () => {
      manager.resetVehicles([vehicle1, vehicle2]);
      const state = manager.getState();
      expect(state.vehicles.size).toBe(2);
      expect(state.vehicles.get('y1234')).toEqual(vehicle1);
    });

    it('updates a single vehicle', () => {
      manager.resetVehicles([vehicle1]);
      const updated = { ...vehicle1, latitude: 42.36 };
      manager.upsertVehicle(updated);
      expect(manager.getState().vehicles.get('y1234')!.latitude).toBe(42.36);
    });

    it('removes a vehicle', () => {
      manager.resetVehicles([vehicle1, vehicle2]);
      manager.removeVehicle('y1234');
      expect(manager.getState().vehicles.size).toBe(1);
      expect(manager.getState().vehicles.has('y1234')).toBe(false);
    });
  });

  describe('predictions', () => {
    const pred: Prediction = {
      id: 'pred-1',
      routeId: 'Red',
      stopId: 'place-pktrm',
      directionId: 0,
      arrivalTime: '2026-04-06T12:10:00-04:00',
      departureTime: '2026-04-06T12:10:30-04:00',
      status: null,
      tripId: 'trip-100',
      vehicleId: 'y1234',
      stopSequence: 5,
    };

    it('resets predictions grouped by stop', () => {
      manager.resetPredictions([pred]);
      const preds = manager.getState().predictions;
      expect(preds.get('place-pktrm')).toHaveLength(1);
      expect(preds.get('place-pktrm')![0].id).toBe('pred-1');
    });

    it('upserts a prediction into existing stop group', () => {
      manager.resetPredictions([pred]);
      const pred2 = { ...pred, id: 'pred-2', arrivalTime: '2026-04-06T12:15:00-04:00' };
      manager.upsertPrediction(pred2);
      expect(manager.getState().predictions.get('place-pktrm')).toHaveLength(2);
    });

    it('removes a prediction', () => {
      manager.resetPredictions([pred]);
      manager.removePrediction('pred-1', 'place-pktrm');
      expect(manager.getState().predictions.get('place-pktrm')).toHaveLength(0);
    });
  });

  describe('alerts', () => {
    const alert: Alert = {
      id: 'alert-1',
      effect: 'SHUTTLE',
      cause: 'MAINTENANCE',
      header: 'Test alert',
      description: 'Test description',
      severity: 7,
      lifecycle: 'ONGOING',
      activePeriod: [{ start: '2026-04-06T05:00:00-04:00', end: null }],
      informedEntities: [{ routeId: 'Red', stopId: null, directionId: null, routeType: 1, activities: ['RIDE'] }],
      updatedAt: '2026-04-06T08:00:00-04:00',
    };

    it('resets alerts', () => {
      manager.resetAlerts([alert]);
      expect(manager.getState().alerts).toHaveLength(1);
    });

    it('upserts an alert by id', () => {
      manager.resetAlerts([alert]);
      const updated = { ...alert, header: 'Updated alert' };
      manager.upsertAlert(updated);
      expect(manager.getState().alerts).toHaveLength(1);
      expect(manager.getState().alerts[0].header).toBe('Updated alert');
    });

    it('removes an alert', () => {
      manager.resetAlerts([alert]);
      manager.removeAlert('alert-1');
      expect(manager.getState().alerts).toHaveLength(0);
    });
  });

  describe('snapshot', () => {
    it('returns a serializable snapshot of the full state', () => {
      const vehicle: Vehicle = {
        id: 'v1',
        routeId: 'Blue',
        latitude: 42.36,
        longitude: -71.05,
        bearing: 90,
        currentStatus: 'STOPPED_AT',
        stopId: 'place-state',
        directionId: 0,
        label: 'v1',
        updatedAt: '2026-04-06T12:00:00-04:00',
      };
      manager.resetVehicles([vehicle]);

      const snapshot = manager.getSnapshot();
      expect(snapshot.vehicles).toBeInstanceOf(Array);
      expect(snapshot.vehicles).toHaveLength(1);
      expect(snapshot.vehicles[0].id).toBe('v1');
      expect(snapshot.predictions).toBeInstanceOf(Object);
      expect(snapshot.alerts).toBeInstanceOf(Array);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/MBTA
npm test --workspace=backend
```

Expected: FAIL — cannot find `../src/state-manager.js`

- [ ] **Step 3: Write the state manager implementation**

```typescript
// backend/src/state-manager.ts
import type {
  Vehicle,
  Prediction,
  Alert,
  Facility,
  FacilityStatus,
  Weather,
  SystemState,
} from './types.js';

export class StateManager {
  private state: SystemState = {
    vehicles: new Map(),
    predictions: new Map(),
    alerts: [],
    facilities: new Map(),
    facilityStatuses: new Map(),
    weather: null,
  };

  getState(): SystemState {
    return this.state;
  }

  // --- Vehicles ---

  resetVehicles(vehicles: Vehicle[]): void {
    this.state.vehicles.clear();
    for (const v of vehicles) {
      this.state.vehicles.set(v.id, v);
    }
  }

  upsertVehicle(vehicle: Vehicle): void {
    this.state.vehicles.set(vehicle.id, vehicle);
  }

  removeVehicle(id: string): void {
    this.state.vehicles.delete(id);
  }

  // --- Predictions ---

  resetPredictions(predictions: Prediction[]): void {
    this.state.predictions.clear();
    for (const p of predictions) {
      const list = this.state.predictions.get(p.stopId) ?? [];
      list.push(p);
      this.state.predictions.set(p.stopId, list);
    }
  }

  upsertPrediction(prediction: Prediction): void {
    const list = this.state.predictions.get(prediction.stopId) ?? [];
    const idx = list.findIndex((p) => p.id === prediction.id);
    if (idx >= 0) {
      list[idx] = prediction;
    } else {
      list.push(prediction);
    }
    this.state.predictions.set(prediction.stopId, list);
  }

  removePrediction(predictionId: string, stopId: string): void {
    const list = this.state.predictions.get(stopId);
    if (!list) return;
    const filtered = list.filter((p) => p.id !== predictionId);
    this.state.predictions.set(stopId, filtered);
  }

  // --- Alerts ---

  resetAlerts(alerts: Alert[]): void {
    this.state.alerts = alerts;
  }

  upsertAlert(alert: Alert): void {
    const idx = this.state.alerts.findIndex((a) => a.id === alert.id);
    if (idx >= 0) {
      this.state.alerts[idx] = alert;
    } else {
      this.state.alerts.push(alert);
    }
  }

  removeAlert(id: string): void {
    this.state.alerts = this.state.alerts.filter((a) => a.id !== id);
  }

  // --- Facilities ---

  setFacilities(facilities: Facility[]): void {
    this.state.facilities.clear();
    for (const f of facilities) {
      this.state.facilities.set(f.id, f);
    }
  }

  setFacilityStatuses(statuses: FacilityStatus[]): void {
    this.state.facilityStatuses.clear();
    for (const s of statuses) {
      this.state.facilityStatuses.set(s.facilityId, s);
    }
  }

  // --- Weather ---

  setWeather(weather: Weather | null): void {
    this.state.weather = weather;
  }

  // --- Snapshot (serializable for WebSocket) ---

  getSnapshot(): {
    vehicles: Vehicle[];
    predictions: Record<string, Prediction[]>;
    alerts: Alert[];
    facilities: { facility: Facility; status: FacilityStatus | undefined }[];
    weather: Weather | null;
  } {
    const predictions: Record<string, Prediction[]> = {};
    for (const [stopId, preds] of this.state.predictions) {
      predictions[stopId] = preds;
    }

    const facilities: { facility: Facility; status: FacilityStatus | undefined }[] = [];
    for (const [id, facility] of this.state.facilities) {
      facilities.push({
        facility,
        status: this.state.facilityStatuses.get(id),
      });
    }

    return {
      vehicles: Array.from(this.state.vehicles.values()),
      predictions,
      alerts: this.state.alerts,
      facilities,
      weather: this.state.weather,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/MBTA
npm test --workspace=backend
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/state-manager.ts backend/test/state-manager.test.ts
git commit -m "feat(backend): add state manager with vehicle/prediction/alert CRUD"
```

---

### Task 5: GTFS Polyline Decoder

**Files:**
- Create: `backend/src/gtfs-loader.ts`
- Create: `backend/test/gtfs-loader.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/test/gtfs-loader.test.ts
import { describe, it, expect } from 'vitest';
import { decodePolyline } from '../src/gtfs-loader.js';

describe('decodePolyline', () => {
  it('decodes a simple Google encoded polyline into [lat, lng] pairs', () => {
    // This encodes the path: (38.5, -120.2), (40.7, -120.95), (43.252, -126.453)
    const encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    const result = decodePolyline(encoded);

    expect(result).toHaveLength(3);
    expect(result[0][0]).toBeCloseTo(38.5, 4);
    expect(result[0][1]).toBeCloseTo(-120.2, 4);
    expect(result[1][0]).toBeCloseTo(40.7, 4);
    expect(result[1][1]).toBeCloseTo(-120.95, 4);
    expect(result[2][0]).toBeCloseTo(43.252, 4);
    expect(result[2][1]).toBeCloseTo(-126.453, 4);
  });

  it('returns an empty array for empty input', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/MBTA
npm test --workspace=backend
```

Expected: FAIL

- [ ] **Step 3: Write the polyline decoder and GTFS loader**

```typescript
// backend/src/gtfs-loader.ts

// Decodes a Google encoded polyline string into an array of [lat, lng] pairs.
// Reference: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

export interface RouteShape {
  shapeId: string;
  routeId: string;
  coordinates: [number, number][]; // [lat, lng][]
}

// Fetches all shapes for MBTA subway routes from the API and decodes them.
export async function loadShapes(apiKey: string): Promise<Map<string, RouteShape[]>> {
  const routes = ['Red', 'Orange', 'Blue', 'Green-B', 'Green-C', 'Green-D', 'Green-E', 'Mattapan'];
  const shapesByRoute = new Map<string, RouteShape[]>();

  for (const routeId of routes) {
    const url = `https://api-v3.mbta.com/shapes?filter[route]=${routeId}&api_key=${apiKey}`;
    const response = await fetch(url);
    const json = await response.json();
    const shapes: RouteShape[] = [];

    for (const resource of json.data) {
      const encoded = resource.attributes.polyline as string;
      shapes.push({
        shapeId: resource.id,
        routeId,
        coordinates: decodePolyline(encoded),
      });
    }

    shapesByRoute.set(routeId, shapes);
  }

  return shapesByRoute;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/MBTA
npm test --workspace=backend
```

Expected: all polyline decoder tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/gtfs-loader.ts backend/test/gtfs-loader.test.ts
git commit -m "feat(backend): add Google polyline decoder and GTFS shape loader"
```

---

### Task 6: MBTA SSE Stream Client

**Files:**
- Create: `backend/src/mbta-stream.ts`

- [ ] **Step 1: Write the SSE stream client**

This module connects to the MBTA V3 SSE endpoints and emits parsed events. It's tested via integration (connecting to the real API in dev) rather than unit tests, since it's primarily I/O glue.

```typescript
// backend/src/mbta-stream.ts
import EventSource from 'eventsource';
import { parseVehicle, parsePrediction, parseAlert } from './mbta-parser.js';
import type { Vehicle, Prediction, Alert } from './types.js';

export type StreamEvent<T> =
  | { type: 'reset'; data: T[] }
  | { type: 'add'; data: T }
  | { type: 'update'; data: T }
  | { type: 'remove'; id: string };

interface StreamOptions {
  apiKey: string;
  onVehicleEvent: (event: StreamEvent<Vehicle>) => void;
  onPredictionEvent: (event: StreamEvent<Prediction>) => void;
  onAlertEvent: (event: StreamEvent<Alert>) => void;
  onError: (source: string, error: unknown) => void;
}

export class MbtaStream {
  private sources: EventSource[] = [];
  private options: StreamOptions;

  constructor(options: StreamOptions) {
    this.options = options;
  }

  start(): void {
    this.connectVehicles();
    this.connectPredictions();
    this.connectAlerts();
  }

  stop(): void {
    for (const source of this.sources) {
      source.close();
    }
    this.sources = [];
  }

  private connectVehicles(): void {
    const url = `https://api-v3.mbta.com/vehicles?filter[route_type]=0,1&api_key=${this.options.apiKey}`;
    const es = new EventSource(url, { headers: { Accept: 'text/event-stream' } });

    this.attachHandlers(es, 'vehicles', (resource) => parseVehicle(resource), this.options.onVehicleEvent);
    this.sources.push(es);
  }

  private connectPredictions(): void {
    const url = `https://api-v3.mbta.com/predictions?filter[route_type]=0,1&api_key=${this.options.apiKey}`;
    const es = new EventSource(url, { headers: { Accept: 'text/event-stream' } });

    this.attachHandlers(es, 'predictions', (resource) => parsePrediction(resource), this.options.onPredictionEvent);
    this.sources.push(es);
  }

  private connectAlerts(): void {
    const url = `https://api-v3.mbta.com/alerts?filter[route_type]=0,1&api_key=${this.options.apiKey}`;
    const es = new EventSource(url, { headers: { Accept: 'text/event-stream' } });

    this.attachHandlers(es, 'alerts', (resource) => parseAlert(resource), this.options.onAlertEvent);
    this.sources.push(es);
  }

  private attachHandlers<T>(
    es: EventSource,
    label: string,
    parse: (resource: any) => T,
    emit: (event: StreamEvent<T>) => void,
  ): void {
    es.addEventListener('reset', (e: MessageEvent) => {
      const json = JSON.parse(e.data);
      const items = Array.isArray(json) ? json : json.data ?? [json];
      const parsed = (Array.isArray(items) ? items : [items]).map(parse);
      emit({ type: 'reset', data: parsed });
    });

    es.addEventListener('add', (e: MessageEvent) => {
      const json = JSON.parse(e.data);
      const resource = json.data ?? json;
      emit({ type: 'add', data: parse(resource) });
    });

    es.addEventListener('update', (e: MessageEvent) => {
      const json = JSON.parse(e.data);
      const resource = json.data ?? json;
      emit({ type: 'update', data: parse(resource) });
    });

    es.addEventListener('remove', (e: MessageEvent) => {
      const json = JSON.parse(e.data);
      const id = json.data?.id ?? json.id ?? '';
      emit({ type: 'remove', id });
    });

    es.onerror = (err) => {
      this.options.onError(label, err);
    };
  }
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd ~/MBTA
npx --workspace=backend tsc --noEmit
```

Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add backend/src/mbta-stream.ts
git commit -m "feat(backend): add MBTA SSE stream client for vehicles/predictions/alerts"
```

---

### Task 7: Facility Poller

**Files:**
- Create: `backend/src/facility-poller.ts`
- Create: `backend/test/facility-poller.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/test/facility-poller.test.ts
import { describe, it, expect } from 'vitest';
import { parseFacilityStatusFromApi } from '../src/facility-poller.js';
import type { FacilityStatus } from '../src/types.js';

describe('parseFacilityStatusFromApi', () => {
  it('parses live facility data into FacilityStatus array', () => {
    const apiResponse = {
      data: [
        {
          type: 'facility',
          id: 'facility-123',
          attributes: {
            long_name: 'Park Street Elevator',
            short_name: 'Elevator',
            type: 'ELEVATOR',
            properties: [
              { name: 'status', value: 'WORKING' },
              { name: 'updated-at', value: '2026-04-06T12:00:00-04:00' },
            ],
            latitude: null,
            longitude: null,
          },
          relationships: {
            stop: { data: { type: 'stop', id: 'place-pktrm' } },
          },
        },
      ],
    };

    const statuses = parseFacilityStatusFromApi(apiResponse);
    expect(statuses).toHaveLength(1);
    expect(statuses[0].facilityId).toBe('facility-123');
    expect(statuses[0].status).toBe('WORKING');
  });

  it('defaults to WORKING when no status property exists', () => {
    const apiResponse = {
      data: [
        {
          type: 'facility',
          id: 'facility-456',
          attributes: {
            long_name: 'Escalator',
            short_name: 'Escalator',
            type: 'ESCALATOR',
            properties: [],
            latitude: null,
            longitude: null,
          },
          relationships: {
            stop: { data: { type: 'stop', id: 'place-dwnxg' } },
          },
        },
      ],
    };

    const statuses = parseFacilityStatusFromApi(apiResponse);
    expect(statuses[0].status).toBe('WORKING');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/MBTA
npm test --workspace=backend
```

Expected: FAIL

- [ ] **Step 3: Write the facility poller**

```typescript
// backend/src/facility-poller.ts
import { parseFacility } from './mbta-parser.js';
import type { Facility, FacilityStatus, MbtaResource } from './types.js';

export function parseFacilityStatusFromApi(
  apiResponse: { data: MbtaResource[] },
): FacilityStatus[] {
  return apiResponse.data.map((resource) => {
    const properties = (resource.attributes.properties as { name: string; value: string }[]) ?? [];
    const statusProp = properties.find((p) => p.name === 'status');
    const updatedProp = properties.find((p) => p.name === 'updated-at');

    return {
      facilityId: resource.id,
      status: statusProp?.value === 'OUT_OF_ORDER' ? 'OUT_OF_ORDER' : 'WORKING',
      updatedAt: updatedProp?.value ?? new Date().toISOString(),
    };
  });
}

export class FacilityPoller {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private apiKey: string;
  private onFacilities: (facilities: Facility[]) => void;
  private onStatuses: (statuses: FacilityStatus[]) => void;
  private onError: (error: unknown) => void;

  constructor(options: {
    apiKey: string;
    onFacilities: (facilities: Facility[]) => void;
    onStatuses: (statuses: FacilityStatus[]) => void;
    onError: (error: unknown) => void;
  }) {
    this.apiKey = options.apiKey;
    this.onFacilities = options.onFacilities;
    this.onStatuses = options.onStatuses;
    this.onError = options.onError;
  }

  start(intervalMs: number = 60_000): void {
    this.poll();
    this.intervalId = setInterval(() => this.poll(), intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      const [facilitiesRes, statusesRes] = await Promise.all([
        fetch(`https://api-v3.mbta.com/facilities?filter[type]=ELEVATOR,ESCALATOR&api_key=${this.apiKey}`),
        fetch(`https://api-v3.mbta.com/facilities?filter[type]=ELEVATOR,ESCALATOR&api_key=${this.apiKey}`),
      ]);

      const facilitiesJson = await facilitiesRes.json();
      const statusesJson = await statusesRes.json();

      const facilities = facilitiesJson.data.map((r: MbtaResource) => parseFacility(r));
      const statuses = parseFacilityStatusFromApi(statusesJson);

      this.onFacilities(facilities);
      this.onStatuses(statuses);
    } catch (err) {
      this.onError(err);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/MBTA
npm test --workspace=backend
```

Expected: all facility poller tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/facility-poller.ts backend/test/facility-poller.test.ts
git commit -m "feat(backend): add facility status poller with parser"
```

---

### Task 8: Weather Poller

**Files:**
- Create: `backend/src/weather-poller.ts`

- [ ] **Step 1: Write the weather poller**

The NWS API is free and simple. No unit test needed — this is pure HTTP glue.

```typescript
// backend/src/weather-poller.ts
import type { Weather } from './types.js';

// Boston NWS gridpoint (pre-looked-up)
const NWS_FORECAST_URL = 'https://api.weather.gov/gridpoints/BOX/71,90/forecast/hourly';

export class WeatherPoller {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onWeather: (weather: Weather | null) => void;
  private onError: (error: unknown) => void;

  constructor(options: {
    onWeather: (weather: Weather | null) => void;
    onError: (error: unknown) => void;
  }) {
    this.onWeather = options.onWeather;
    this.onError = options.onError;
  }

  start(intervalMs: number = 900_000): void {
    this.poll();
    this.intervalId = setInterval(() => this.poll(), intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      const response = await fetch(NWS_FORECAST_URL, {
        headers: { 'User-Agent': 'BostonSubwayLive/1.0 (contact@example.com)' },
      });

      if (!response.ok) {
        this.onWeather(null);
        return;
      }

      const json = await response.json();
      const current = json.properties?.periods?.[0];

      if (!current) {
        this.onWeather(null);
        return;
      }

      this.onWeather({
        temperature: current.temperature,
        condition: current.shortForecast,
        icon: current.icon,
      });
    } catch (err) {
      this.onError(err);
    }
  }
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd ~/MBTA
npx --workspace=backend tsc --noEmit
```

Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add backend/src/weather-poller.ts
git commit -m "feat(backend): add NWS weather poller for Boston area"
```

---

### Task 9: WebSocket Server

**Files:**
- Create: `backend/src/ws-server.ts`

- [ ] **Step 1: Write the WebSocket fan-out server**

```typescript
// backend/src/ws-server.ts
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { WsMessage } from './types.js';
import type { StateManager } from './state-manager.js';

export class WsBroadcaster {
  private wss: WebSocketServer;
  private stateManager: StateManager;

  constructor(server: Server, stateManager: StateManager) {
    this.stateManager = stateManager;
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket) => {
      // Send full state snapshot on connect
      const snapshot = this.stateManager.getSnapshot();
      const msg: WsMessage = {
        type: 'full-state',
        data: snapshot,
        timestamp: Date.now(),
      };
      ws.send(JSON.stringify(msg));
    });
  }

  broadcast(message: WsMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  broadcastVehicles(vehicles: unknown): void {
    this.broadcast({
      type: 'vehicles-update',
      data: vehicles,
      timestamp: Date.now(),
    });
  }

  broadcastPredictions(predictions: unknown): void {
    this.broadcast({
      type: 'predictions-update',
      data: predictions,
      timestamp: Date.now(),
    });
  }

  broadcastAlerts(alerts: unknown): void {
    this.broadcast({
      type: 'alerts-update',
      data: alerts,
      timestamp: Date.now(),
    });
  }

  broadcastFacilities(facilities: unknown): void {
    this.broadcast({
      type: 'facilities-update',
      data: facilities,
      timestamp: Date.now(),
    });
  }

  broadcastWeather(weather: unknown): void {
    this.broadcast({
      type: 'weather-update',
      data: weather,
      timestamp: Date.now(),
    });
  }
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd ~/MBTA
npx --workspace=backend tsc --noEmit
```

Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add backend/src/ws-server.ts
git commit -m "feat(backend): add WebSocket broadcaster for client fan-out"
```

---

### Task 10: Backend Entry Point — Wire Everything Together

**Files:**
- Create: `backend/src/index.ts`

- [ ] **Step 1: Write the Express server that wires all components**

```typescript
// backend/src/index.ts
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { StateManager } from './state-manager.js';
import { MbtaStream } from './mbta-stream.js';
import { WsBroadcaster } from './ws-server.js';
import { FacilityPoller } from './facility-poller.js';
import { WeatherPoller } from './weather-poller.js';
import { loadShapes } from './gtfs-loader.js';
import type { Vehicle, Prediction, Alert } from './types.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const MBTA_API_KEY = process.env.MBTA_API_KEY ?? '';

if (!MBTA_API_KEY) {
  console.error('MBTA_API_KEY is required. Get one at https://api-v3.mbta.com/');
  process.exit(1);
}

const app = express();
app.use(cors());

const server = createServer(app);
const stateManager = new StateManager();
const wsBroadcaster = new WsBroadcaster(server, stateManager);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    vehicles: stateManager.getState().vehicles.size,
    clients: 0, // Could track this in WsBroadcaster
  });
});

// Shapes endpoint — serves pre-loaded GTFS shapes as GeoJSON-like data
let shapesCache: Awaited<ReturnType<typeof loadShapes>> | null = null;

app.get('/api/shapes', async (_req, res) => {
  if (!shapesCache) {
    shapesCache = await loadShapes(MBTA_API_KEY);
  }

  const result: Record<string, { shapeId: string; coordinates: [number, number][] }[]> = {};
  for (const [routeId, shapes] of shapesCache) {
    result[routeId] = shapes.map((s) => ({
      shapeId: s.shapeId,
      coordinates: s.coordinates,
    }));
  }

  res.json(result);
});

// Stops endpoint — proxies MBTA stops for subway
app.get('/api/stops', async (_req, res) => {
  try {
    const response = await fetch(
      `https://api-v3.mbta.com/stops?filter[route_type]=0,1&api_key=${MBTA_API_KEY}`
    );
    const json = await response.json();
    res.json(json);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stops' });
  }
});

// Start MBTA SSE streams
const mbtaStream = new MbtaStream({
  apiKey: MBTA_API_KEY,
  onVehicleEvent: (event) => {
    switch (event.type) {
      case 'reset':
        stateManager.resetVehicles(event.data as Vehicle[]);
        wsBroadcaster.broadcastVehicles({ type: 'reset', vehicles: stateManager.getSnapshot().vehicles });
        break;
      case 'add':
      case 'update':
        stateManager.upsertVehicle(event.data as Vehicle);
        wsBroadcaster.broadcastVehicles({ type: 'upsert', vehicle: event.data });
        break;
      case 'remove':
        stateManager.removeVehicle(event.id);
        wsBroadcaster.broadcastVehicles({ type: 'remove', id: event.id });
        break;
    }
  },
  onPredictionEvent: (event) => {
    switch (event.type) {
      case 'reset':
        stateManager.resetPredictions(event.data as Prediction[]);
        wsBroadcaster.broadcastPredictions({ type: 'reset', predictions: stateManager.getSnapshot().predictions });
        break;
      case 'add':
      case 'update':
        stateManager.upsertPrediction(event.data as Prediction);
        wsBroadcaster.broadcastPredictions({ type: 'upsert', prediction: event.data });
        break;
      case 'remove': {
        // We need the stopId to remove. The prediction ID format includes it.
        // For simplicity, broadcast the full predictions state after removal.
        // In production, you'd track prediction → stop mapping.
        wsBroadcaster.broadcastPredictions({ type: 'reset', predictions: stateManager.getSnapshot().predictions });
        break;
      }
    }
  },
  onAlertEvent: (event) => {
    switch (event.type) {
      case 'reset':
        stateManager.resetAlerts(event.data as Alert[]);
        wsBroadcaster.broadcastAlerts({ type: 'reset', alerts: stateManager.getSnapshot().alerts });
        break;
      case 'add':
      case 'update':
        stateManager.upsertAlert(event.data as Alert);
        wsBroadcaster.broadcastAlerts({ type: 'upsert', alert: event.data });
        break;
      case 'remove':
        stateManager.removeAlert(event.id);
        wsBroadcaster.broadcastAlerts({ type: 'remove', id: event.id });
        break;
    }
  },
  onError: (source, error) => {
    console.error(`[MBTA SSE ${source}] Error:`, error);
  },
});

// Start facility poller
const facilityPoller = new FacilityPoller({
  apiKey: MBTA_API_KEY,
  onFacilities: (facilities) => {
    stateManager.setFacilities(facilities);
    wsBroadcaster.broadcastFacilities({ facilities: stateManager.getSnapshot().facilities });
  },
  onStatuses: (statuses) => {
    stateManager.setFacilityStatuses(statuses);
    wsBroadcaster.broadcastFacilities({ facilities: stateManager.getSnapshot().facilities });
  },
  onError: (err) => console.error('[Facility Poller] Error:', err),
});

// Start weather poller
const weatherPoller = new WeatherPoller({
  onWeather: (weather) => {
    stateManager.setWeather(weather);
    wsBroadcaster.broadcastWeather({ weather });
  },
  onError: (err) => console.error('[Weather Poller] Error:', err),
});

// Boot sequence
async function start() {
  console.log('Loading GTFS shapes...');
  shapesCache = await loadShapes(MBTA_API_KEY);
  console.log(`Loaded shapes for ${shapesCache.size} routes`);

  mbtaStream.start();
  console.log('MBTA SSE streams connected');

  facilityPoller.start(60_000);
  console.log('Facility poller started (60s interval)');

  weatherPoller.start(900_000);
  console.log('Weather poller started (15min interval)');

  server.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
    console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify types compile**

```bash
cd ~/MBTA
npx --workspace=backend tsc --noEmit
```

Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat(backend): wire up Express server with SSE streams, pollers, and WS fan-out"
```

---

## Phase 2: Frontend Core — Map + Trains

### Task 11: Frontend Types + MBTA Colors

**Files:**
- Create: `frontend/src/types.ts`
- Create: `frontend/src/utils/mbta-colors.ts`

- [ ] **Step 1: Write shared frontend types**

```typescript
// frontend/src/types.ts

export interface Vehicle {
  id: string;
  routeId: string;
  latitude: number;
  longitude: number;
  bearing: number;
  currentStatus: 'IN_TRANSIT_TO' | 'STOPPED_AT' | 'INCOMING_AT';
  stopId: string;
  directionId: number;
  label: string;
  updatedAt: string;
}

export interface Prediction {
  id: string;
  routeId: string;
  stopId: string;
  directionId: number;
  arrivalTime: string | null;
  departureTime: string | null;
  status: string | null;
  tripId: string;
  vehicleId: string | null;
  stopSequence: number;
}

export interface Alert {
  id: string;
  effect: string;
  cause: string;
  header: string;
  description: string;
  severity: number;
  lifecycle: string;
  activePeriod: { start: string; end: string | null }[];
  informedEntities: {
    routeId: string | null;
    stopId: string | null;
    directionId: number | null;
    routeType: number | null;
    activities: string[];
  }[];
  updatedAt: string;
}

export interface FacilityWithStatus {
  facility: {
    id: string;
    longName: string;
    shortName: string;
    type: 'ELEVATOR' | 'ESCALATOR';
    stopId: string;
    latitude: number | null;
    longitude: number | null;
  };
  status: {
    facilityId: string;
    status: 'WORKING' | 'OUT_OF_ORDER';
    updatedAt: string;
  } | undefined;
}

export interface Weather {
  temperature: number;
  condition: string;
  icon: string;
}

export interface SystemSnapshot {
  vehicles: Vehicle[];
  predictions: Record<string, Prediction[]>;
  alerts: Alert[];
  facilities: FacilityWithStatus[];
  weather: Weather | null;
}

export type WsMessageType =
  | 'full-state'
  | 'vehicles-update'
  | 'predictions-update'
  | 'alerts-update'
  | 'facilities-update'
  | 'weather-update';

export interface WsMessage {
  type: WsMessageType;
  data: any;
  timestamp: number;
}

export type ViewMode = 'map' | 'boards';

export interface RouteShape {
  shapeId: string;
  coordinates: [number, number][]; // [lat, lng]
}

export interface Stop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  wheelchairBoarding: number;
  routeIds: string[];
}
```

- [ ] **Step 2: Write MBTA colors utility**

```typescript
// frontend/src/utils/mbta-colors.ts

export const MBTA_COLORS: Record<string, [number, number, number]> = {
  'Red':     [218, 41, 28],    // #DA291C
  'Orange':  [237, 139, 0],    // #ED8B00
  'Blue':    [0, 61, 165],     // #003DA5
  'Green-B': [0, 132, 61],     // #00843D
  'Green-C': [0, 153, 68],     // #009944
  'Green-D': [0, 166, 80],     // #00A650
  'Green-E': [0, 178, 92],     // #00B25C
  'Mattapan':[218, 41, 28],    // #DA291C (same as Red)
};

export const MBTA_COLORS_HEX: Record<string, string> = {
  'Red':     '#DA291C',
  'Orange':  '#ED8B00',
  'Blue':    '#003DA5',
  'Green-B': '#00843D',
  'Green-C': '#009944',
  'Green-D': '#00A650',
  'Green-E': '#00B25C',
  'Mattapan':'#DA291C',
};

export function getRouteColor(routeId: string): [number, number, number] {
  return MBTA_COLORS[routeId] ?? [128, 128, 128];
}

export function getRouteColorHex(routeId: string): string {
  return MBTA_COLORS_HEX[routeId] ?? '#808080';
}

export function getRouteDisplayName(routeId: string): string {
  const names: Record<string, string> = {
    'Red': 'Red Line',
    'Orange': 'Orange Line',
    'Blue': 'Blue Line',
    'Green-B': 'Green Line B',
    'Green-C': 'Green Line C',
    'Green-D': 'Green Line D',
    'Green-E': 'Green Line E',
    'Mattapan': 'Mattapan Trolley',
  };
  return names[routeId] ?? routeId;
}

export const ALL_ROUTE_IDS = [
  'Red', 'Orange', 'Blue', 'Green-B', 'Green-C', 'Green-D', 'Green-E', 'Mattapan',
];
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types.ts frontend/src/utils/mbta-colors.ts
git commit -m "feat(frontend): add shared types and MBTA color constants"
```

---

### Task 12: Polyline Decoder + Time Formatter Utilities

**Files:**
- Create: `frontend/src/utils/polyline-decoder.ts`
- Create: `frontend/src/utils/time-format.ts`
- Create: `frontend/test/utils/polyline-decoder.test.ts`
- Create: `frontend/test/utils/time-format.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/test/utils/polyline-decoder.test.ts
import { describe, it, expect } from 'vitest';
import { decodePolyline } from '../../src/utils/polyline-decoder';

describe('decodePolyline', () => {
  it('decodes a Google encoded polyline into [lng, lat] pairs (GeoJSON order)', () => {
    const encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    const result = decodePolyline(encoded);

    expect(result).toHaveLength(3);
    // GeoJSON order: [lng, lat]
    expect(result[0][0]).toBeCloseTo(-120.2, 4);   // lng
    expect(result[0][1]).toBeCloseTo(38.5, 4);      // lat
  });

  it('returns empty array for empty input', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});
```

```typescript
// frontend/test/utils/time-format.test.ts
import { describe, it, expect, vi } from 'vitest';
import { formatArrival, formatMinutesUntil } from '../../src/utils/time-format';

describe('formatMinutesUntil', () => {
  it('returns "Arriving" for times less than 1 minute away', () => {
    const now = new Date('2026-04-06T12:00:00-04:00');
    const arrival = new Date('2026-04-06T12:00:30-04:00');
    expect(formatMinutesUntil(arrival.toISOString(), now)).toBe('Arriving');
  });

  it('returns "X min" for future times', () => {
    const now = new Date('2026-04-06T12:00:00-04:00');
    const arrival = new Date('2026-04-06T12:05:00-04:00');
    expect(formatMinutesUntil(arrival.toISOString(), now)).toBe('5 min');
  });

  it('returns "Departed" for past times', () => {
    const now = new Date('2026-04-06T12:05:00-04:00');
    const arrival = new Date('2026-04-06T12:00:00-04:00');
    expect(formatMinutesUntil(arrival.toISOString(), now)).toBe('Departed');
  });
});

describe('formatArrival', () => {
  it('returns status when provided', () => {
    expect(formatArrival(null, 'Arriving')).toBe('Arriving');
  });

  it('formats arrival time when no status', () => {
    const now = new Date('2026-04-06T12:00:00-04:00');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(formatArrival('2026-04-06T12:03:00-04:00', null)).toBe('3 min');
    vi.useRealTimers();
  });

  it('returns empty string when no data', () => {
    expect(formatArrival(null, null)).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/MBTA
npm test --workspace=frontend
```

Expected: FAIL

- [ ] **Step 3: Write the implementations**

```typescript
// frontend/src/utils/polyline-decoder.ts

// Decodes a Google encoded polyline into [lng, lat] pairs (GeoJSON/deck.gl order).
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += result & 1 ? ~(result >> 1) : result >> 1;

    // GeoJSON order: [lng, lat]
    points.push([lng / 1e5, lat / 1e5]);
  }

  return points;
}
```

```typescript
// frontend/src/utils/time-format.ts

export function formatMinutesUntil(isoTime: string, now: Date = new Date()): string {
  const target = new Date(isoTime);
  const diffMs = target.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60_000);

  if (diffMin < 0) return 'Departed';
  if (diffMin < 1) return 'Arriving';
  return `${diffMin} min`;
}

export function formatArrival(arrivalTime: string | null, status: string | null): string {
  if (status) return status;
  if (arrivalTime) return formatMinutesUntil(arrivalTime);
  return '';
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/MBTA
npm test --workspace=frontend
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/polyline-decoder.ts frontend/src/utils/time-format.ts frontend/test/utils/
git commit -m "feat(frontend): add polyline decoder and time formatting utilities with tests"
```

---

### Task 13: Snap-to-Route + Trail Builder Utilities

**Files:**
- Create: `frontend/src/utils/snap-to-route.ts`
- Create: `frontend/src/utils/trail-builder.ts`
- Create: `frontend/test/utils/snap-to-route.test.ts`
- Create: `frontend/test/utils/trail-builder.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/test/utils/snap-to-route.test.ts
import { describe, it, expect } from 'vitest';
import { snapToRoute, findNearestPointIndex } from '../../src/utils/snap-to-route';

describe('findNearestPointIndex', () => {
  const routeCoords: [number, number][] = [
    [-71.10, 42.35],  // point 0
    [-71.08, 42.36],  // point 1
    [-71.06, 42.355], // point 2
    [-71.04, 42.36],  // point 3
  ];

  it('returns the index of the nearest point on the route', () => {
    // Close to point 2
    const idx = findNearestPointIndex(-71.061, 42.354, routeCoords);
    expect(idx).toBe(2);
  });

  it('returns 0 for a point near the start', () => {
    const idx = findNearestPointIndex(-71.10, 42.35, routeCoords);
    expect(idx).toBe(0);
  });
});

describe('snapToRoute', () => {
  const routeCoords: [number, number][] = [
    [-71.10, 42.35],
    [-71.08, 42.36],
    [-71.06, 42.355],
    [-71.04, 42.36],
  ];

  it('returns the nearest route coordinate', () => {
    const snapped = snapToRoute(-71.061, 42.354, routeCoords);
    expect(snapped[0]).toBeCloseTo(-71.06, 2);
    expect(snapped[1]).toBeCloseTo(42.355, 2);
  });
});
```

```typescript
// frontend/test/utils/trail-builder.test.ts
import { describe, it, expect } from 'vitest';
import { buildTrail } from '../../src/utils/trail-builder';

describe('buildTrail', () => {
  const routeCoords: [number, number][] = [
    [-71.10, 42.35],
    [-71.09, 42.355],
    [-71.08, 42.36],
    [-71.07, 42.355],
    [-71.06, 42.355],
    [-71.05, 42.36],
  ];

  it('returns a trail of N points ending at the head index', () => {
    const trail = buildTrail(routeCoords, 4, 3);
    expect(trail).toHaveLength(3);
    // Trail should end at index 4 and go backwards
    expect(trail[trail.length - 1]).toEqual(routeCoords[4]);
    expect(trail[0]).toEqual(routeCoords[2]);
  });

  it('returns shorter trail when near start of route', () => {
    const trail = buildTrail(routeCoords, 1, 5);
    // Can only go back 1 point from index 1
    expect(trail).toHaveLength(2);
    expect(trail[0]).toEqual(routeCoords[0]);
    expect(trail[1]).toEqual(routeCoords[1]);
  });

  it('returns single point when at index 0', () => {
    const trail = buildTrail(routeCoords, 0, 3);
    expect(trail).toHaveLength(1);
    expect(trail[0]).toEqual(routeCoords[0]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/MBTA
npm test --workspace=frontend
```

Expected: FAIL

- [ ] **Step 3: Write the implementations**

```typescript
// frontend/src/utils/snap-to-route.ts

// Squared distance between two [lng, lat] points (no need for haversine at city scale).
function distSq(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const dLng = lng1 - lng2;
  const dLat = lat1 - lat2;
  return dLng * dLng + dLat * dLat;
}

// Finds the index of the nearest coordinate in the route to the given [lng, lat].
export function findNearestPointIndex(
  lng: number,
  lat: number,
  routeCoords: [number, number][],
): number {
  let minDist = Infinity;
  let minIdx = 0;

  for (let i = 0; i < routeCoords.length; i++) {
    const d = distSq(lng, lat, routeCoords[i][0], routeCoords[i][1]);
    if (d < minDist) {
      minDist = d;
      minIdx = i;
    }
  }

  return minIdx;
}

// Snaps a GPS coordinate to the nearest point on a route.
export function snapToRoute(
  lng: number,
  lat: number,
  routeCoords: [number, number][],
): [number, number] {
  const idx = findNearestPointIndex(lng, lat, routeCoords);
  return routeCoords[idx];
}
```

```typescript
// frontend/src/utils/trail-builder.ts

// Builds a trail (polyline segment) behind the train's current position.
// headIndex: the index in routeCoords where the train currently is.
// trailLength: how many points to include behind the head.
// Returns a sub-array of routeCoords from (headIndex - trailLength + 1) to headIndex.
export function buildTrail(
  routeCoords: [number, number][],
  headIndex: number,
  trailLength: number,
): [number, number][] {
  const startIdx = Math.max(0, headIndex - trailLength + 1);
  return routeCoords.slice(startIdx, headIndex + 1);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/MBTA
npm test --workspace=frontend
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/snap-to-route.ts frontend/src/utils/trail-builder.ts frontend/test/utils/
git commit -m "feat(frontend): add snap-to-route and trail builder utilities with tests"
```

---

### Task 14: WebSocket Hook + System State Hook

**Files:**
- Create: `frontend/src/hooks/useWebSocket.ts`
- Create: `frontend/src/hooks/useSystemState.ts`

- [ ] **Step 1: Write the WebSocket connection hook**

```typescript
// frontend/src/hooks/useWebSocket.ts
import { useEffect, useRef, useCallback, useState } from 'react';
import type { WsMessage } from '../types';

interface UseWebSocketOptions {
  url: string;
  onMessage: (message: WsMessage) => void;
  reconnectInterval?: number;
}

export function useWebSocket({ url, onMessage, reconnectInterval = 3000 }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        onMessageRef.current(msg);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect
      setTimeout(() => {
        if (wsRef.current === ws) {
          connect();
        }
      }, reconnectInterval);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [url, reconnectInterval]);

  useEffect(() => {
    connect();
    return () => {
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [connect]);

  return { connected };
}
```

- [ ] **Step 2: Write the system state hook**

```typescript
// frontend/src/hooks/useSystemState.ts
import { useState, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import type { Vehicle, Prediction, Alert, FacilityWithStatus, Weather, WsMessage, SystemSnapshot } from '../types';

const WS_URL = `ws://${window.location.hostname}:3001/ws`;

export function useSystemState() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction[]>>({});
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [facilities, setFacilities] = useState<FacilityWithStatus[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);

  const handleMessage = useCallback((msg: WsMessage) => {
    switch (msg.type) {
      case 'full-state': {
        const data = msg.data as SystemSnapshot;
        setVehicles(data.vehicles);
        setPredictions(data.predictions);
        setAlerts(data.alerts);
        setFacilities(data.facilities);
        setWeather(data.weather);
        break;
      }
      case 'vehicles-update': {
        const data = msg.data as any;
        if (data.type === 'reset') {
          setVehicles(data.vehicles);
        } else if (data.type === 'upsert') {
          setVehicles((prev) => {
            const idx = prev.findIndex((v) => v.id === data.vehicle.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = data.vehicle;
              return next;
            }
            return [...prev, data.vehicle];
          });
        } else if (data.type === 'remove') {
          setVehicles((prev) => prev.filter((v) => v.id !== data.id));
        }
        break;
      }
      case 'predictions-update': {
        const data = msg.data as any;
        if (data.type === 'reset') {
          setPredictions(data.predictions);
        } else if (data.type === 'upsert') {
          setPredictions((prev) => {
            const stopId = data.prediction.stopId;
            const existing = prev[stopId] ?? [];
            const idx = existing.findIndex((p: Prediction) => p.id === data.prediction.id);
            const updated = idx >= 0
              ? existing.map((p: Prediction, i: number) => (i === idx ? data.prediction : p))
              : [...existing, data.prediction];
            return { ...prev, [stopId]: updated };
          });
        }
        break;
      }
      case 'alerts-update': {
        const data = msg.data as any;
        if (data.type === 'reset') {
          setAlerts(data.alerts);
        } else if (data.type === 'upsert') {
          setAlerts((prev) => {
            const idx = prev.findIndex((a) => a.id === data.alert.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = data.alert;
              return next;
            }
            return [...prev, data.alert];
          });
        } else if (data.type === 'remove') {
          setAlerts((prev) => prev.filter((a) => a.id !== data.id));
        }
        break;
      }
      case 'facilities-update': {
        const data = msg.data as any;
        setFacilities(data.facilities);
        break;
      }
      case 'weather-update': {
        const data = msg.data as any;
        setWeather(data.weather);
        break;
      }
    }
  }, []);

  const { connected } = useWebSocket({
    url: WS_URL,
    onMessage: handleMessage,
  });

  return { vehicles, predictions, alerts, facilities, weather, connected };
}
```

- [ ] **Step 3: Verify types compile**

```bash
cd ~/MBTA
npx --workspace=frontend tsc --noEmit
```

Expected: clean exit.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/
git commit -m "feat(frontend): add WebSocket and system state hooks"
```

---

### Task 15: Global Styles + Dark Theme

**Files:**
- Create: `frontend/src/styles/global.css`
- Create: `frontend/src/styles/nav.css`
- Create: `frontend/src/styles/tooltip.css`

- [ ] **Step 1: Write the dark theme styles**

```css
/* frontend/src/styles/global.css */
:root {
  --bg-primary: #0a0a0a;
  --bg-surface: #141414;
  --bg-tooltip: rgba(20, 20, 20, 0.92);
  --text-primary: #e0e0e0;
  --text-secondary: #888888;
  --text-muted: #555555;
  --red-line: #DA291C;
  --orange-line: #ED8B00;
  --blue-line: #003DA5;
  --green-line: #00843D;
  --status-ok: #4CAF50;
  --status-alert: #FF9800;
  --status-down: #F44336;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
  width: 100vw;
  height: 100vh;
}

#root {
  width: 100%;
  height: 100%;
}
```

```css
/* frontend/src/styles/nav.css */
.nav-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: rgba(10, 10, 10, 0.85);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.nav-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nav-title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: var(--text-primary);
}

.nav-tabs {
  display: flex;
  gap: 4px;
}

.nav-tab {
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-muted);
  background: none;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-tab:hover {
  color: var(--text-secondary);
}

.nav-tab.active {
  color: var(--text-primary);
  border-color: rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.05);
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.accessibility-toggle {
  padding: 6px 10px;
  font-size: 14px;
  background: none;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-muted);
  transition: all 0.2s;
}

.accessibility-toggle:hover {
  color: var(--text-secondary);
}

.accessibility-toggle.active {
  color: #4CAF50;
  border-color: rgba(76, 175, 80, 0.3);
  background: rgba(76, 175, 80, 0.1);
}
```

```css
/* frontend/src/styles/tooltip.css */
.train-tooltip {
  position: absolute;
  pointer-events: none;
  z-index: 2000;
  min-width: 220px;
  padding: 14px 16px;
  background: var(--bg-tooltip);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
}

.tooltip-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.tooltip-color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.tooltip-line-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.tooltip-direction {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.tooltip-progress {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  margin-bottom: 4px;
  overflow: hidden;
}

.tooltip-progress-bar {
  height: 100%;
  border-radius: 2px;
  transition: width 0.5s ease;
}

.tooltip-progress-text {
  font-size: 10px;
  color: var(--text-muted);
  text-align: right;
  margin-bottom: 10px;
}

.tooltip-stops {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tooltip-stops-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.tooltip-stop-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.tooltip-stop-name {
  color: var(--text-secondary);
}

.tooltip-stop-time {
  color: var(--text-primary);
  font-weight: 500;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/styles/
git commit -m "feat(frontend): add dark theme global styles, nav, and tooltip CSS"
```

---

### Task 16: NavBar + LiveIndicator Components

**Files:**
- Create: `frontend/src/components/NavBar.tsx`
- Create: `frontend/src/components/LiveIndicator.tsx`

- [ ] **Step 1: Write the LiveIndicator component**

```typescript
// frontend/src/components/LiveIndicator.tsx
import { type FC } from 'react';

interface LiveIndicatorProps {
  connected: boolean;
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  } as const,
  dot: (connected: boolean) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: connected ? '#4CAF50' : '#F44336',
    animation: connected ? 'pulse 2s ease-in-out infinite' : 'none',
  }),
  text: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '1.5px',
    color: '#e0e0e0',
  } as const,
};

export const LiveIndicator: FC<LiveIndicatorProps> = ({ connected }) => (
  <>
    <style>{`
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
    `}</style>
    <div style={styles.container}>
      <div style={styles.dot(connected)} />
      <span style={styles.text}>LIVE</span>
    </div>
  </>
);
```

- [ ] **Step 2: Write the NavBar component**

```typescript
// frontend/src/components/NavBar.tsx
import { type FC } from 'react';
import { LiveIndicator } from './LiveIndicator';
import type { ViewMode } from '../types';
import '../styles/nav.css';

interface NavBarProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  accessibilityOn: boolean;
  onAccessibilityToggle: () => void;
  connected: boolean;
}

export const NavBar: FC<NavBarProps> = ({
  view,
  onViewChange,
  accessibilityOn,
  onAccessibilityToggle,
  connected,
}) => (
  <nav className="nav-bar">
    <div className="nav-left">
      <span className="nav-title">BOSTON SUBWAY</span>
      <LiveIndicator connected={connected} />
    </div>

    <div className="nav-tabs">
      <button
        className={`nav-tab ${view === 'map' ? 'active' : ''}`}
        onClick={() => onViewChange('map')}
      >
        Map
      </button>
      <button
        className={`nav-tab ${view === 'boards' ? 'active' : ''}`}
        onClick={() => onViewChange('boards')}
      >
        Boards
      </button>
    </div>

    <div className="nav-right">
      <button
        className={`accessibility-toggle ${accessibilityOn ? 'active' : ''}`}
        onClick={onAccessibilityToggle}
        title="Toggle accessibility overlay"
        aria-label="Toggle accessibility overlay"
      >
        ♿
      </button>
    </div>
  </nav>
);
```

- [ ] **Step 3: Verify types compile**

```bash
cd ~/MBTA
npx --workspace=frontend tsc --noEmit
```

Expected: clean exit.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/NavBar.tsx frontend/src/components/LiveIndicator.tsx
git commit -m "feat(frontend): add NavBar and LiveIndicator components"
```

---

### Task 17: deck.gl Map Layers — Routes + Stations

**Files:**
- Create: `frontend/src/layers/RouteLayer.ts`
- Create: `frontend/src/layers/StationLayer.ts`

- [ ] **Step 1: Write the RouteLayer**

```typescript
// frontend/src/layers/RouteLayer.ts
import { PathLayer } from '@deck.gl/layers';
import { getRouteColor } from '../utils/mbta-colors';

export interface RoutePathData {
  routeId: string;
  path: [number, number][]; // [lng, lat][]
}

export function createRouteLayer(routes: RoutePathData[]) {
  return new PathLayer({
    id: 'route-paths',
    data: routes,
    getPath: (d: RoutePathData) => d.path,
    getColor: (d: RoutePathData) => [...getRouteColor(d.routeId), 180],
    getWidth: 3,
    widthUnits: 'pixels' as const,
    widthMinPixels: 2,
    widthMaxPixels: 6,
    capRounded: true,
    jointRounded: true,
    pickable: false,
  });
}
```

- [ ] **Step 2: Write the StationLayer**

```typescript
// frontend/src/layers/StationLayer.ts
import { ScatterplotLayer } from '@deck.gl/layers';
import type { Stop } from '../types';

export function createStationLayer(
  stops: Stop[],
  accessibilityOn: boolean,
  brokenFacilityStopIds: Set<string>,
) {
  return new ScatterplotLayer({
    id: 'station-dots',
    data: stops,
    getPosition: (d: Stop) => [d.longitude, d.latitude],
    getRadius: 4,
    radiusUnits: 'pixels' as const,
    radiusMinPixels: 3,
    radiusMaxPixels: 8,
    getFillColor: (d: Stop) => {
      if (accessibilityOn && brokenFacilityStopIds.has(d.id)) {
        return [244, 67, 54, 255]; // Red for broken facilities
      }
      return [255, 255, 255, 220]; // White default
    },
    getLineColor: [255, 255, 255, 60],
    lineWidthMinPixels: 1,
    stroked: true,
    pickable: true,
    updateTriggers: {
      getFillColor: [accessibilityOn, brokenFacilityStopIds],
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/layers/
git commit -m "feat(frontend): add route path and station dot deck.gl layers"
```

---

### Task 18: Train Layer — Animated Polyline Trails

**Files:**
- Create: `frontend/src/layers/TrainLayer.ts`
- Create: `frontend/src/hooks/useTrainPositions.ts`

- [ ] **Step 1: Write the useTrainPositions hook**

This hook snaps vehicle GPS positions to route shapes and builds trail segments.

```typescript
// frontend/src/hooks/useTrainPositions.ts
import { useMemo } from 'react';
import type { Vehicle } from '../types';
import type { RoutePathData } from '../layers/RouteLayer';
import { findNearestPointIndex } from '../utils/snap-to-route';
import { buildTrail } from '../utils/trail-builder';

export interface TrainTrailData {
  vehicleId: string;
  routeId: string;
  trail: [number, number][];
  bearing: number;
  currentStatus: string;
  stopId: string;
  directionId: number;
  label: string;
}

const TRAIL_POINTS = 20; // Number of route points in the trail behind the head

export function useTrainPositions(
  vehicles: Vehicle[],
  routeShapes: Map<string, RoutePathData[]>,
): TrainTrailData[] {
  return useMemo(() => {
    const trails: TrainTrailData[] = [];

    for (const vehicle of vehicles) {
      const shapes = routeShapes.get(vehicle.routeId);
      if (!shapes || shapes.length === 0) continue;

      // Use the first shape for this route (primary direction shape)
      // Pick the shape whose direction matches (shape index 0 for dir 0, 1 for dir 1)
      const shape = shapes[Math.min(vehicle.directionId, shapes.length - 1)] ?? shapes[0];
      const routeCoords = shape.path;

      if (routeCoords.length === 0) continue;

      const headIdx = findNearestPointIndex(vehicle.longitude, vehicle.latitude, routeCoords);
      const trail = buildTrail(routeCoords, headIdx, TRAIL_POINTS);

      trails.push({
        vehicleId: vehicle.id,
        routeId: vehicle.routeId,
        trail,
        bearing: vehicle.bearing,
        currentStatus: vehicle.currentStatus,
        stopId: vehicle.stopId,
        directionId: vehicle.directionId,
        label: vehicle.label,
      });
    }

    return trails;
  }, [vehicles, routeShapes]);
}
```

- [ ] **Step 2: Write the TrainLayer**

```typescript
// frontend/src/layers/TrainLayer.ts
import { PathLayer } from '@deck.gl/layers';
import { getRouteColor } from '../utils/mbta-colors';
import type { TrainTrailData } from '../hooks/useTrainPositions';

export function createTrainLayer(trains: TrainTrailData[]) {
  return new PathLayer({
    id: 'train-trails',
    data: trains,
    getPath: (d: TrainTrailData) => d.trail,
    getColor: (d: TrainTrailData) => [...getRouteColor(d.routeId), 230],
    getWidth: 5,
    widthUnits: 'pixels' as const,
    widthMinPixels: 3,
    widthMaxPixels: 8,
    capRounded: true,
    jointRounded: true,
    pickable: true,
    // deck.gl transitions for smooth movement
    transitions: {
      getPath: { duration: 2000, type: 'interpolation' },
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/layers/TrainLayer.ts frontend/src/hooks/useTrainPositions.ts
git commit -m "feat(frontend): add animated train trail layer with route snapping"
```

---

### Task 19: Train Tooltip Overlay

**Files:**
- Create: `frontend/src/overlays/TrainTooltip.tsx`

- [ ] **Step 1: Write the train tooltip**

```typescript
// frontend/src/overlays/TrainTooltip.tsx
import { type FC } from 'react';
import { getRouteColorHex, getRouteDisplayName } from '../utils/mbta-colors';
import { formatMinutesUntil } from '../utils/time-format';
import type { Prediction } from '../types';
import '../styles/tooltip.css';

interface TrainTooltipProps {
  x: number;
  y: number;
  routeId: string;
  directionId: number;
  stopId: string;
  predictions: Prediction[];
}

const DIRECTION_LABELS: Record<string, Record<number, string>> = {
  'Red':     { 0: 'Ashmont/Braintree', 1: 'Alewife' },
  'Orange':  { 0: 'Forest Hills', 1: 'Oak Grove' },
  'Blue':    { 0: 'Bowdoin', 1: 'Wonderland' },
  'Green-B': { 0: 'Boston College', 1: 'Government Center' },
  'Green-C': { 0: 'Cleveland Circle', 1: 'Government Center' },
  'Green-D': { 0: 'Riverside', 1: 'Union Square' },
  'Green-E': { 0: 'Heath Street', 1: 'Medford/Tufts' },
  'Mattapan':{ 0: 'Mattapan', 1: 'Ashmont' },
};

export const TrainTooltip: FC<TrainTooltipProps> = ({
  x,
  y,
  routeId,
  directionId,
  stopId,
  predictions,
}) => {
  const color = getRouteColorHex(routeId);
  const lineName = getRouteDisplayName(routeId);
  const direction = DIRECTION_LABELS[routeId]?.[directionId] ?? `Direction ${directionId}`;

  // Get next 3 predictions for this vehicle's direction
  const upcoming = predictions
    .filter((p) => p.directionId === directionId && p.arrivalTime)
    .sort((a, b) => new Date(a.arrivalTime!).getTime() - new Date(b.arrivalTime!).getTime())
    .slice(0, 3);

  return (
    <div
      className="train-tooltip"
      style={{ left: x + 12, top: y - 12 }}
    >
      <div className="tooltip-header">
        <div className="tooltip-color-dot" style={{ background: color }} />
        <span className="tooltip-line-name">{lineName}</span>
      </div>
      <div className="tooltip-direction">→ {direction}</div>

      {upcoming.length > 0 && (
        <div className="tooltip-stops">
          <div className="tooltip-stops-label">Next stops</div>
          {upcoming.map((pred) => (
            <div key={pred.id} className="tooltip-stop-row">
              <span className="tooltip-stop-name">{pred.stopId.replace('place-', '')}</span>
              <span className="tooltip-stop-time">
                {formatMinutesUntil(pred.arrivalTime!)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/overlays/TrainTooltip.tsx
git commit -m "feat(frontend): add train hover tooltip overlay"
```

---

### Task 20: LiveMap Component — Wire Map + All Layers

**Files:**
- Create: `frontend/src/components/LiveMap.tsx`

- [ ] **Step 1: Write the main map component**

```typescript
// frontend/src/components/LiveMap.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Map } from 'react-map-gl/maplibre';
import { DeckGL } from '@deck.gl/react';
import type { PickingInfo } from '@deck.gl/core';
import { createRouteLayer, type RoutePathData } from '../layers/RouteLayer';
import { createStationLayer } from '../layers/StationLayer';
import { createTrainLayer } from '../layers/TrainLayer';
import { useTrainPositions, type TrainTrailData } from '../hooks/useTrainPositions';
import { TrainTooltip } from '../overlays/TrainTooltip';
import { decodePolyline } from '../utils/polyline-decoder';
import type { Vehicle, Prediction, Alert, FacilityWithStatus, Stop } from '../types';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_API_KEY ?? '';
const MAP_STYLE = `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`;

const INITIAL_VIEW_STATE = {
  longitude: -71.0565,
  latitude: 42.3555,
  zoom: 13,
  pitch: 45,
  bearing: 0,
};

interface LiveMapProps {
  vehicles: Vehicle[];
  predictions: Record<string, Prediction[]>;
  alerts: Alert[];
  facilities: FacilityWithStatus[];
  accessibilityOn: boolean;
}

export function LiveMap({
  vehicles,
  predictions,
  alerts,
  facilities,
  accessibilityOn,
}: LiveMapProps) {
  const [routeShapes, setRouteShapes] = useState<Map<string, RoutePathData[]>>(new Map());
  const [stops, setStops] = useState<Stop[]>([]);
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    train: TrainTrailData;
  } | null>(null);

  // Load shapes and stops on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [shapesRes, stopsRes] = await Promise.all([
          fetch('/api/shapes'),
          fetch('/api/stops'),
        ]);

        // Parse shapes
        const shapesJson = await shapesRes.json();
        const shapesMap = new Map<string, RoutePathData[]>();
        for (const [routeId, shapes] of Object.entries(shapesJson)) {
          shapesMap.set(
            routeId,
            (shapes as any[]).map((s) => ({
              routeId,
              path: s.coordinates.map((c: [number, number]) => [c[1], c[0]]),
              // shapes come as [lat, lng] from backend, convert to [lng, lat]
            })),
          );
        }
        setRouteShapes(shapesMap);

        // Parse stops
        const stopsJson = await stopsRes.json();
        const parsedStops: Stop[] = stopsJson.data.map((s: any) => ({
          id: s.id,
          name: s.attributes.name,
          latitude: s.attributes.latitude,
          longitude: s.attributes.longitude,
          wheelchairBoarding: s.attributes.wheelchair_boarding ?? 0,
          routeIds: [],
        }));
        setStops(parsedStops);
      } catch (err) {
        console.error('Failed to load map data:', err);
      }
    }
    loadData();
  }, []);

  // Build flattened route paths for the layer
  const routePaths = useMemo(() => {
    const paths: RoutePathData[] = [];
    for (const [, shapes] of routeShapes) {
      for (const shape of shapes) {
        paths.push(shape);
      }
    }
    return paths;
  }, [routeShapes]);

  // Build train trails
  const trainTrails = useTrainPositions(vehicles, routeShapes);

  // Broken facility stop IDs for accessibility overlay
  const brokenFacilityStopIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of facilities) {
      if (f.status?.status === 'OUT_OF_ORDER') {
        ids.add(f.facility.stopId);
      }
    }
    return ids;
  }, [facilities]);

  // Build layers
  const layers = useMemo(() => [
    createRouteLayer(routePaths),
    createStationLayer(stops, accessibilityOn, brokenFacilityStopIds),
    createTrainLayer(trainTrails),
  ], [routePaths, stops, trainTrails, accessibilityOn, brokenFacilityStopIds]);

  const onHover = useCallback((info: PickingInfo) => {
    if (info.layer?.id === 'train-trails' && info.object) {
      const train = info.object as TrainTrailData;
      setHoverInfo({ x: info.x, y: info.y, train });
    } else {
      setHoverInfo(null);
    }
  }, []);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
        onHover={onHover}
      >
        <Map mapStyle={MAP_STYLE} />
      </DeckGL>

      {hoverInfo && (
        <TrainTooltip
          x={hoverInfo.x}
          y={hoverInfo.y}
          routeId={hoverInfo.train.routeId}
          directionId={hoverInfo.train.directionId}
          stopId={hoverInfo.train.stopId}
          predictions={predictions[hoverInfo.train.stopId] ?? []}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/LiveMap.tsx
git commit -m "feat(frontend): add LiveMap component with deck.gl layers and hover tooltip"
```

---

### Task 21: App Shell + Entry Point

**Files:**
- Create: `frontend/src/components/App.tsx`
- Create: `frontend/src/main.tsx`

- [ ] **Step 1: Write the App component**

```typescript
// frontend/src/components/App.tsx
import { useState } from 'react';
import { NavBar } from './NavBar';
import { LiveMap } from './LiveMap';
import { useSystemState } from '../hooks/useSystemState';
import type { ViewMode } from '../types';
import '../styles/global.css';

export function App() {
  const [view, setView] = useState<ViewMode>('map');
  const [accessibilityOn, setAccessibilityOn] = useState(false);
  const { vehicles, predictions, alerts, facilities, weather, connected } = useSystemState();

  return (
    <>
      <NavBar
        view={view}
        onViewChange={setView}
        accessibilityOn={accessibilityOn}
        onAccessibilityToggle={() => setAccessibilityOn((prev) => !prev)}
        connected={connected}
      />

      {view === 'map' && (
        <LiveMap
          vehicles={vehicles}
          predictions={predictions}
          alerts={alerts}
          facilities={facilities}
          accessibilityOn={accessibilityOn}
        />
      )}

      {view === 'boards' && (
        <div style={{ paddingTop: 60, textAlign: 'center', color: '#888' }}>
          Departure boards — coming in Phase 2
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Write the entry point**

```typescript
// frontend/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 3: Verify frontend compiles**

```bash
cd ~/MBTA
npx --workspace=frontend tsc --noEmit
```

Expected: clean exit (may have minor type issues to resolve with deck.gl — fix any that arise).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/App.tsx frontend/src/main.tsx
git commit -m "feat(frontend): add App shell with map view and nav wiring"
```

---

## Phase 3: Interactivity + Departure Boards

### Task 22: Station Popup Overlay

**Files:**
- Create: `frontend/src/overlays/StationPopup.tsx`

- [ ] **Step 1: Write the station popup**

```typescript
// frontend/src/overlays/StationPopup.tsx
import { type FC } from 'react';
import { getRouteColorHex, getRouteDisplayName } from '../utils/mbta-colors';
import { formatMinutesUntil } from '../utils/time-format';
import type { Prediction, FacilityWithStatus, Stop } from '../types';

interface StationPopupProps {
  stop: Stop;
  predictions: Prediction[];
  facilities: FacilityWithStatus[];
  onClose: () => void;
}

export const StationPopup: FC<StationPopupProps> = ({
  stop,
  predictions,
  facilities,
  onClose,
}) => {
  // Group predictions by route
  const byRoute = new Map<string, Prediction[]>();
  for (const pred of predictions) {
    if (!pred.arrivalTime) continue;
    const list = byRoute.get(pred.routeId) ?? [];
    list.push(pred);
    byRoute.set(pred.routeId, list);
  }

  // Sort each route's predictions by arrival time
  for (const [, preds] of byRoute) {
    preds.sort((a, b) =>
      new Date(a.arrivalTime!).getTime() - new Date(b.arrivalTime!).getTime()
    );
  }

  // Facilities at this stop
  const stopFacilities = facilities.filter((f) => f.facility.stopId === stop.id);
  const brokenFacilities = stopFacilities.filter((f) => f.status?.status === 'OUT_OF_ORDER');
  const allWorking = brokenFacilities.length === 0;

  return (
    <div style={{
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 2000,
      minWidth: 280,
      padding: '16px 20px',
      background: 'rgba(20, 20, 20, 0.95)',
      borderRadius: 10,
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#e0e0e0' }}>{stop.name}</span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          ✕
        </button>
      </div>

      {Array.from(byRoute.entries()).map(([routeId, preds]) => (
        <div key={routeId} style={{ marginBottom: 12 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: getRouteColorHex(routeId),
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            {getRouteDisplayName(routeId)}
          </div>
          {preds.slice(0, 4).map((pred) => (
            <div key={pred.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '3px 0',
              fontSize: 13,
            }}>
              <span style={{ color: '#aaa' }}>
                {pred.stopId.replace('place-', '')}
              </span>
              <span style={{ color: '#e0e0e0', fontWeight: 500 }}>
                {formatMinutesUntil(pred.arrivalTime!)}
              </span>
            </div>
          ))}
        </div>
      ))}

      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingTop: 8,
        marginTop: 4,
        fontSize: 12,
      }}>
        {allWorking ? (
          <span style={{ color: '#4CAF50' }}>♿ All elevators/escalators working</span>
        ) : (
          brokenFacilities.map((f) => (
            <div key={f.facility.id} style={{ color: '#F44336', marginBottom: 2 }}>
              ⚠ {f.facility.shortName} out of service
            </div>
          ))
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/overlays/StationPopup.tsx
git commit -m "feat(frontend): add station popup with arrivals and facility status"
```

---

### Task 23: Departure Board View

**Files:**
- Create: `frontend/src/styles/board.css`
- Create: `frontend/src/board/BoardHeader.tsx`
- Create: `frontend/src/board/BoardLine.tsx`
- Create: `frontend/src/board/BoardAlerts.tsx`
- Create: `frontend/src/components/DepartureBoard.tsx`
- Create: `frontend/src/hooks/useGeolocation.ts`

- [ ] **Step 1: Write the board CSS**

```css
/* frontend/src/styles/board.css */
.board {
  width: 100%;
  height: 100vh;
  padding-top: 60px;
  background: var(--bg-primary);
  overflow-y: auto;
}

.board-container {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.board-station-name {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.board-station-selector {
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  margin-bottom: 20px;
  appearance: none;
  cursor: pointer;
}

.board-line-section {
  margin-bottom: 20px;
}

.board-line-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  padding: 8px 0;
  border-bottom: 2px solid;
  margin-bottom: 8px;
}

.board-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.board-destination {
  font-size: 15px;
  color: var(--text-primary);
  font-weight: 500;
}

.board-time {
  font-size: 15px;
  color: var(--text-primary);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.board-status {
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: 8px;
}

.board-status.delayed {
  color: var(--status-alert);
}

.board-alert {
  padding: 10px 14px;
  margin-top: 16px;
  background: rgba(255, 152, 0, 0.1);
  border: 1px solid rgba(255, 152, 0, 0.2);
  border-radius: 6px;
  font-size: 13px;
  color: var(--status-alert);
}

.board-facility-alert {
  padding: 10px 14px;
  margin-top: 8px;
  background: rgba(244, 67, 54, 0.1);
  border: 1px solid rgba(244, 67, 54, 0.2);
  border-radius: 6px;
  font-size: 13px;
  color: var(--status-down);
}
```

- [ ] **Step 2: Write the geolocation hook**

```typescript
// frontend/src/hooks/useGeolocation.ts
import { useState, useEffect } from 'react';

interface GeoPosition {
  latitude: number;
  longitude: number;
}

export function useGeolocation() {
  const [position, setPosition] = useState<GeoPosition | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      () => {
        // Geolocation denied or unavailable — no-op
      },
    );
  }, []);

  return position;
}
```

- [ ] **Step 3: Write the BoardHeader**

```typescript
// frontend/src/board/BoardHeader.tsx
import { type FC } from 'react';
import type { Stop } from '../types';

interface BoardHeaderProps {
  selectedStop: Stop | null;
  stops: Stop[];
  onSelectStop: (stopId: string) => void;
}

export const BoardHeader: FC<BoardHeaderProps> = ({ selectedStop, stops, onSelectStop }) => (
  <div>
    <div className="board-station-name">
      {selectedStop?.name ?? 'Select a station'}
    </div>
    <select
      className="board-station-selector"
      value={selectedStop?.id ?? ''}
      onChange={(e) => onSelectStop(e.target.value)}
    >
      <option value="">Choose station...</option>
      {stops
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((stop) => (
          <option key={stop.id} value={stop.id}>{stop.name}</option>
        ))}
    </select>
  </div>
);
```

- [ ] **Step 4: Write the BoardLine**

```typescript
// frontend/src/board/BoardLine.tsx
import { type FC } from 'react';
import { getRouteColorHex, getRouteDisplayName } from '../utils/mbta-colors';
import { formatMinutesUntil } from '../utils/time-format';
import type { Prediction } from '../types';

interface BoardLineProps {
  routeId: string;
  predictions: Prediction[];
}

const DIRECTION_NAMES: Record<string, Record<number, string>> = {
  'Red':     { 0: 'Ashmont/Braintree', 1: 'Alewife' },
  'Orange':  { 0: 'Forest Hills', 1: 'Oak Grove' },
  'Blue':    { 0: 'Bowdoin', 1: 'Wonderland' },
  'Green-B': { 0: 'Boston College', 1: 'Government Ctr' },
  'Green-C': { 0: 'Cleveland Circle', 1: 'Government Ctr' },
  'Green-D': { 0: 'Riverside', 1: 'Union Square' },
  'Green-E': { 0: 'Heath Street', 1: 'Medford/Tufts' },
  'Mattapan':{ 0: 'Mattapan', 1: 'Ashmont' },
};

export const BoardLine: FC<BoardLineProps> = ({ routeId, predictions }) => {
  const color = getRouteColorHex(routeId);

  const sorted = [...predictions]
    .filter((p) => p.arrivalTime)
    .sort((a, b) => new Date(a.arrivalTime!).getTime() - new Date(b.arrivalTime!).getTime())
    .slice(0, 6);

  if (sorted.length === 0) return null;

  return (
    <div className="board-line-section">
      <div className="board-line-title" style={{ borderColor: color, color }}>
        {getRouteDisplayName(routeId)}
      </div>
      {sorted.map((pred) => {
        const destination = DIRECTION_NAMES[routeId]?.[pred.directionId] ?? '';
        const timeStr = formatMinutesUntil(pred.arrivalTime!);
        const isDelayed = timeStr === 'Departed';

        return (
          <div key={pred.id} className="board-row">
            <span className="board-destination">{destination}</span>
            <div>
              <span className="board-time">{timeStr}</span>
              <span className={`board-status ${isDelayed ? 'delayed' : ''}`}>
                {isDelayed ? 'Delayed' : 'On time'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 5: Write the BoardAlerts**

```typescript
// frontend/src/board/BoardAlerts.tsx
import { type FC } from 'react';
import type { Alert, FacilityWithStatus } from '../types';

interface BoardAlertsProps {
  alerts: Alert[];
  facilities: FacilityWithStatus[];
  stopId: string;
}

export const BoardAlerts: FC<BoardAlertsProps> = ({ alerts, facilities, stopId }) => {
  // Alerts affecting this stop
  const relevantAlerts = alerts.filter((a) =>
    a.informedEntities.some((e) => e.stopId === stopId || !e.stopId)
  );

  // Broken facilities at this stop
  const brokenFacilities = facilities.filter(
    (f) => f.facility.stopId === stopId && f.status?.status === 'OUT_OF_ORDER'
  );

  if (relevantAlerts.length === 0 && brokenFacilities.length === 0) return null;

  return (
    <div>
      {relevantAlerts.map((alert) => (
        <div key={alert.id} className="board-alert">
          ⚠ {alert.header}
        </div>
      ))}
      {brokenFacilities.map((f) => (
        <div key={f.facility.id} className="board-facility-alert">
          ♿ {f.facility.shortName} out of service
        </div>
      ))}
    </div>
  );
};
```

- [ ] **Step 6: Write the DepartureBoard component**

```typescript
// frontend/src/components/DepartureBoard.tsx
import { useState, useEffect, useMemo } from 'react';
import { BoardHeader } from '../board/BoardHeader';
import { BoardLine } from '../board/BoardLine';
import { BoardAlerts } from '../board/BoardAlerts';
import { useGeolocation } from '../hooks/useGeolocation';
import type { Prediction, Alert, FacilityWithStatus, Stop } from '../types';
import '../styles/board.css';

interface DepartureBoardProps {
  predictions: Record<string, Prediction[]>;
  alerts: Alert[];
  facilities: FacilityWithStatus[];
}

export function DepartureBoard({ predictions, alerts, facilities }: DepartureBoardProps) {
  const [stops, setStops] = useState<Stop[]>([]);
  const [selectedStopId, setSelectedStopId] = useState<string>('');
  const geoPosition = useGeolocation();

  // Load stops
  useEffect(() => {
    fetch('/api/stops')
      .then((r) => r.json())
      .then((json) => {
        const parsed: Stop[] = json.data
          .filter((s: any) => s.attributes.location_type === 1 || s.attributes.location_type === 0)
          .map((s: any) => ({
            id: s.id,
            name: s.attributes.name,
            latitude: s.attributes.latitude,
            longitude: s.attributes.longitude,
            wheelchairBoarding: s.attributes.wheelchair_boarding ?? 0,
            routeIds: [],
          }));
        setStops(parsed);
      })
      .catch(console.error);
  }, []);

  // Auto-select nearest station if geolocation available
  useEffect(() => {
    if (!geoPosition || stops.length === 0 || selectedStopId) return;

    let nearest = stops[0];
    let minDist = Infinity;
    for (const stop of stops) {
      const d = (stop.latitude - geoPosition.latitude) ** 2 +
                (stop.longitude - geoPosition.longitude) ** 2;
      if (d < minDist) {
        minDist = d;
        nearest = stop;
      }
    }
    setSelectedStopId(nearest.id);
  }, [geoPosition, stops, selectedStopId]);

  const selectedStop = stops.find((s) => s.id === selectedStopId) ?? null;
  const stopPredictions = predictions[selectedStopId] ?? [];

  // Group predictions by route
  const predsByRoute = useMemo(() => {
    const map = new Map<string, Prediction[]>();
    for (const pred of stopPredictions) {
      const list = map.get(pred.routeId) ?? [];
      list.push(pred);
      map.set(pred.routeId, list);
    }
    return map;
  }, [stopPredictions]);

  return (
    <div className="board">
      <div className="board-container">
        <BoardHeader
          selectedStop={selectedStop}
          stops={stops}
          onSelectStop={setSelectedStopId}
        />

        {Array.from(predsByRoute.entries()).map(([routeId, preds]) => (
          <BoardLine key={routeId} routeId={routeId} predictions={preds} />
        ))}

        {selectedStopId && (
          <BoardAlerts
            alerts={alerts}
            facilities={facilities}
            stopId={selectedStopId}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Update App.tsx to use DepartureBoard**

Modify `frontend/src/components/App.tsx` — replace the placeholder boards view:

```typescript
// Replace the boards placeholder in App.tsx:
// FROM:
//   {view === 'boards' && (
//     <div style={{ paddingTop: 60, textAlign: 'center', color: '#888' }}>
//       Departure boards — coming in Phase 2
//     </div>
//   )}
// TO:
//   {view === 'boards' && (
//     <DepartureBoard
//       predictions={predictions}
//       alerts={alerts}
//       facilities={facilities}
//     />
//   )}

// Add import at top:
// import { DepartureBoard } from './DepartureBoard';
```

The full updated App.tsx:

```typescript
// frontend/src/components/App.tsx
import { useState } from 'react';
import { NavBar } from './NavBar';
import { LiveMap } from './LiveMap';
import { DepartureBoard } from './DepartureBoard';
import { useSystemState } from '../hooks/useSystemState';
import type { ViewMode } from '../types';
import '../styles/global.css';

export function App() {
  const [view, setView] = useState<ViewMode>('map');
  const [accessibilityOn, setAccessibilityOn] = useState(false);
  const { vehicles, predictions, alerts, facilities, weather, connected } = useSystemState();

  return (
    <>
      <NavBar
        view={view}
        onViewChange={setView}
        accessibilityOn={accessibilityOn}
        onAccessibilityToggle={() => setAccessibilityOn((prev) => !prev)}
        connected={connected}
      />

      {view === 'map' && (
        <LiveMap
          vehicles={vehicles}
          predictions={predictions}
          alerts={alerts}
          facilities={facilities}
          accessibilityOn={accessibilityOn}
        />
      )}

      {view === 'boards' && (
        <DepartureBoard
          predictions={predictions}
          alerts={alerts}
          facilities={facilities}
        />
      )}
    </>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/styles/board.css frontend/src/hooks/useGeolocation.ts frontend/src/board/ frontend/src/components/DepartureBoard.tsx frontend/src/components/App.tsx
git commit -m "feat(frontend): add departure board view with station selector and geolocation"
```

---

## Phase 4: Alerts + Accessibility Overlays

### Task 24: Alert Layer + Alert Banner

**Files:**
- Create: `frontend/src/layers/AlertLayer.ts`
- Create: `frontend/src/overlays/AlertBanner.tsx`

- [ ] **Step 1: Write the AlertLayer**

```typescript
// frontend/src/layers/AlertLayer.ts
import { PathLayer } from '@deck.gl/layers';
import type { RoutePathData } from './RouteLayer';
import type { Alert } from '../types';

export interface AlertSegment {
  routeId: string;
  path: [number, number][];
}

// Build grayed-out segments for routes affected by shutdowns/shuttles.
export function getAlertSegments(
  alerts: Alert[],
  routeShapes: Map<string, RoutePathData[]>,
): AlertSegment[] {
  const affectedRoutes = new Set<string>();

  for (const alert of alerts) {
    if (['SHUTTLE', 'SUSPENSION', 'NO_SERVICE'].includes(alert.effect)) {
      for (const entity of alert.informedEntities) {
        if (entity.routeId) {
          affectedRoutes.add(entity.routeId);
        }
      }
    }
  }

  const segments: AlertSegment[] = [];
  for (const routeId of affectedRoutes) {
    const shapes = routeShapes.get(routeId);
    if (!shapes) continue;
    for (const shape of shapes) {
      segments.push({ routeId, path: shape.path });
    }
  }

  return segments;
}

export function createAlertLayer(segments: AlertSegment[]) {
  return new PathLayer({
    id: 'alert-overlay',
    data: segments,
    getPath: (d: AlertSegment) => d.path,
    getColor: [85, 85, 85, 200], // Gray
    getWidth: 5,
    widthUnits: 'pixels' as const,
    widthMinPixels: 3,
    getDashArray: [8, 4],
    dashJustified: true,
    extensions: [], // DashExtension will be added if using @deck.gl/extensions
    pickable: false,
  });
}
```

- [ ] **Step 2: Write the AlertBanner**

```typescript
// frontend/src/overlays/AlertBanner.tsx
import { type FC } from 'react';
import type { Alert } from '../types';

interface AlertBannerProps {
  alerts: Alert[];
}

export const AlertBanner: FC<AlertBannerProps> = ({ alerts }) => {
  // Show only high-severity, ongoing alerts
  const critical = alerts.filter(
    (a) => a.severity >= 5 && a.lifecycle === 'ONGOING'
  );

  if (critical.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 52,
      left: 0,
      right: 0,
      zIndex: 999,
      padding: '8px 20px',
      background: 'rgba(255, 152, 0, 0.15)',
      borderBottom: '1px solid rgba(255, 152, 0, 0.3)',
      backdropFilter: 'blur(10px)',
    }}>
      {critical.map((alert) => (
        <div key={alert.id} style={{
          fontSize: 13,
          color: '#FF9800',
          padding: '2px 0',
        }}>
          ⚠ {alert.header}
        </div>
      ))}
    </div>
  );
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/layers/AlertLayer.ts frontend/src/overlays/AlertBanner.tsx
git commit -m "feat(frontend): add alert overlay layer and system-wide alert banner"
```

---

### Task 25: Accessibility Layer

**Files:**
- Create: `frontend/src/layers/AccessibilityLayer.ts`

- [ ] **Step 1: Write the accessibility overlay layer**

```typescript
// frontend/src/layers/AccessibilityLayer.ts
import { ScatterplotLayer } from '@deck.gl/layers';
import type { Stop, FacilityWithStatus } from '../types';

interface AccessibilityDot {
  longitude: number;
  latitude: number;
  stopId: string;
  stopName: string;
  brokenCount: number;
}

export function buildAccessibilityData(
  stops: Stop[],
  facilities: FacilityWithStatus[],
): AccessibilityDot[] {
  // Count broken facilities per stop
  const brokenByStop = new Map<string, number>();
  for (const f of facilities) {
    if (f.status?.status === 'OUT_OF_ORDER') {
      brokenByStop.set(
        f.facility.stopId,
        (brokenByStop.get(f.facility.stopId) ?? 0) + 1,
      );
    }
  }

  return stops
    .filter((s) => brokenByStop.has(s.id))
    .map((s) => ({
      longitude: s.longitude,
      latitude: s.latitude,
      stopId: s.id,
      stopName: s.name,
      brokenCount: brokenByStop.get(s.id)!,
    }));
}

export function createAccessibilityLayer(data: AccessibilityDot[]) {
  // Pulsing red ring around stations with broken facilities
  return new ScatterplotLayer({
    id: 'accessibility-rings',
    data,
    getPosition: (d: AccessibilityDot) => [d.longitude, d.latitude],
    getRadius: 10,
    radiusUnits: 'pixels' as const,
    radiusMinPixels: 8,
    radiusMaxPixels: 16,
    getFillColor: [244, 67, 54, 80],
    getLineColor: [244, 67, 54, 200],
    getLineWidth: 2,
    lineWidthUnits: 'pixels' as const,
    stroked: true,
    filled: true,
    pickable: true,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/layers/AccessibilityLayer.ts
git commit -m "feat(frontend): add accessibility overlay layer for broken facilities"
```

---

### Task 26: Integrate Alert + Accessibility Layers into LiveMap

**Files:**
- Modify: `frontend/src/components/LiveMap.tsx`

- [ ] **Step 1: Update LiveMap to include alert and accessibility layers**

Add imports at the top of LiveMap.tsx:

```typescript
import { createAlertLayer, getAlertSegments } from '../layers/AlertLayer';
import { createAccessibilityLayer, buildAccessibilityData } from '../layers/AccessibilityLayer';
import { AlertBanner } from '../overlays/AlertBanner';
```

Update the `layers` useMemo to include the new layers:

```typescript
  // Build alert segments
  const alertSegments = useMemo(
    () => getAlertSegments(alerts, routeShapes),
    [alerts, routeShapes],
  );

  // Build accessibility data
  const accessibilityData = useMemo(
    () => accessibilityOn ? buildAccessibilityData(stops, facilities) : [],
    [accessibilityOn, stops, facilities],
  );

  // Build layers
  const layers = useMemo(() => [
    createRouteLayer(routePaths),
    createStationLayer(stops, accessibilityOn, brokenFacilityStopIds),
    createTrainLayer(trainTrails),
    ...(alertSegments.length > 0 ? [createAlertLayer(alertSegments)] : []),
    ...(accessibilityData.length > 0 ? [createAccessibilityLayer(accessibilityData)] : []),
  ], [routePaths, stops, trainTrails, accessibilityOn, brokenFacilityStopIds, alertSegments, accessibilityData]);
```

Add the AlertBanner to the JSX return, after the DeckGL block:

```typescript
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <AlertBanner alerts={alerts} />

      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
        onHover={onHover}
      >
        <Map mapStyle={MAP_STYLE} />
      </DeckGL>

      {hoverInfo && (
        <TrainTooltip
          x={hoverInfo.x}
          y={hoverInfo.y}
          routeId={hoverInfo.train.routeId}
          directionId={hoverInfo.train.directionId}
          stopId={hoverInfo.train.stopId}
          predictions={predictions[hoverInfo.train.stopId] ?? []}
        />
      )}
    </div>
  );
```

- [ ] **Step 2: Verify types compile**

```bash
cd ~/MBTA
npx --workspace=frontend tsc --noEmit
```

Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/LiveMap.tsx
git commit -m "feat(frontend): integrate alert and accessibility layers into LiveMap"
```

---

## Phase 5: Polish + Launch

### Task 27: Loading Skeleton + Error States

**Files:**
- Modify: `frontend/src/components/App.tsx`

- [ ] **Step 1: Add a loading state to App**

Update App.tsx to show a loading screen while WebSocket connects:

```typescript
// Add to the App component return, before the NavBar:
{!connected && (
  <div style={{
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0a0a',
    gap: 16,
  }}>
    <div style={{
      width: 40,
      height: 40,
      border: '3px solid rgba(255,255,255,0.1)',
      borderTopColor: '#DA291C',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
    }} />
    <span style={{ color: '#888', fontSize: 14 }}>
      Connecting to live data...
    </span>
    <style>{`
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `}</style>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/App.tsx
git commit -m "feat(frontend): add loading skeleton while WebSocket connects"
```

---

### Task 28: Meta Tags + Favicon

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Update index.html with meta tags**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Boston Subway Live — Real-Time MBTA Train Map</title>
    <meta name="description" content="Watch MBTA subway trains move in real-time across a 3D map of Boston. Red, Orange, Blue, Green lines and Mattapan Trolley." />

    <!-- Open Graph -->
    <meta property="og:title" content="Boston Subway Live" />
    <meta property="og:description" content="Real-time 3D map of MBTA subway trains moving across Boston." />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="/og-image.png" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Boston Subway Live" />
    <meta name="twitter:description" content="Real-time 3D map of MBTA subway trains." />
    <meta name="twitter:image" content="/og-image.png" />

    <link rel="icon" href="/favicon.ico" />

    <!-- MapTiler GL JS CSS (required for map controls) -->
    <link rel="stylesheet" href="https://cdn.maptiler.com/maplibre-gl-js/v4.5.0/maplibre-gl.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/index.html
git commit -m "feat(frontend): add Open Graph meta tags and maplibre CSS"
```

---

### Task 29: Environment Configuration + .env Files

**Files:**
- Create: `backend/.env.example`
- Create: `frontend/.env.example`

- [ ] **Step 1: Write env examples**

```bash
# backend/.env.example
MBTA_API_KEY=your_mbta_api_key_here
PORT=3001
```

```bash
# frontend/.env.example
VITE_MAPTILER_API_KEY=your_maptiler_api_key_here
```

- [ ] **Step 2: Update .gitignore to cover .env in subdirectories**

Ensure `.gitignore` at root has:

```
node_modules/
dist/
.env
**/.env
*.log
.DS_Store
```

- [ ] **Step 3: Commit**

```bash
git add backend/.env.example frontend/.env.example .gitignore
git commit -m "chore: add .env.example files for backend and frontend API keys"
```

---

### Task 30: End-to-End Integration Test

**Files:** None new — this is a manual verification task.

- [ ] **Step 1: Get API keys**

1. MBTA API key: Visit https://api-v3.mbta.com/ and register for a free key.
2. MapTiler API key: Visit https://cloud.maptiler.com/account/keys/ and get a free key.

- [ ] **Step 2: Configure environment**

```bash
cd ~/MBTA
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Edit both .env files with your API keys
```

- [ ] **Step 3: Install and start**

```bash
cd ~/MBTA
npm install
npm run dev:backend
# In another terminal:
npm run dev:frontend
```

- [ ] **Step 4: Verify in browser**

Open http://localhost:5173

Expected:
- Dark map centered on Boston with 3D buildings
- Colored route lines for Red, Orange, Blue, Green, Mattapan
- White station dots along routes
- Animated colored train trails moving along tracks
- Pulsing "LIVE" indicator in nav bar
- Hover over a train → tooltip with line name, direction, next stops
- Click "BOARDS" → departure board view
- Click ♿ → accessibility overlay (red dots on broken facility stations)
- Alert banner appears if any active shutdowns

- [ ] **Step 5: Run all tests**

```bash
cd ~/MBTA
npm test
```

Expected: All backend and frontend tests pass.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: integration verification complete"
```

---

### Task 31: Tooltip Progress Bar

**Files:**
- Modify: `frontend/src/overlays/TrainTooltip.tsx`
- Modify: `frontend/src/hooks/useTrainPositions.ts`

The spec requires a progress bar showing journey percentage. We compute this from the train's position along its route shape.

- [ ] **Step 1: Update TrainTrailData to include progress**

Add `progress` field to `TrainTrailData` in `frontend/src/hooks/useTrainPositions.ts`:

```typescript
export interface TrainTrailData {
  vehicleId: string;
  routeId: string;
  trail: [number, number][];
  bearing: number;
  currentStatus: string;
  stopId: string;
  directionId: number;
  label: string;
  progress: number; // 0-100, percentage through journey
}
```

In the `useTrainPositions` hook, compute progress from the head index:

```typescript
      const progress = routeCoords.length > 1
        ? Math.round((headIdx / (routeCoords.length - 1)) * 100)
        : 0;

      trails.push({
        vehicleId: vehicle.id,
        routeId: vehicle.routeId,
        trail,
        bearing: vehicle.bearing,
        currentStatus: vehicle.currentStatus,
        stopId: vehicle.stopId,
        directionId: vehicle.directionId,
        label: vehicle.label,
        progress,
      });
```

- [ ] **Step 2: Add progress bar to TrainTooltip**

Update the TrainTooltip JSX to include, between the direction and stops sections:

```typescript
      <div className="tooltip-progress">
        <div
          className="tooltip-progress-bar"
          style={{ width: `${progress}%`, background: color }}
        />
      </div>
      <div className="tooltip-progress-text">{progress}%</div>
```

Add `progress: number` to TrainTooltipProps and pass it from LiveMap when creating the tooltip.

- [ ] **Step 3: Update LiveMap to pass progress**

In LiveMap.tsx, update the hoverInfo state and TrainTooltip rendering to pass `hoverInfo.train.progress`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useTrainPositions.ts frontend/src/overlays/TrainTooltip.tsx frontend/src/components/LiveMap.tsx
git commit -m "feat(frontend): add journey progress bar to train tooltip"
```

---

### Task 32: Weather Indicator Widget

**Files:**
- Create: `frontend/src/components/WeatherIndicator.tsx`
- Modify: `frontend/src/components/App.tsx`

The spec calls for a subtle weather icon in the corner during storms — no map clutter.

- [ ] **Step 1: Write the WeatherIndicator component**

```typescript
// frontend/src/components/WeatherIndicator.tsx
import { type FC } from 'react';
import type { Weather } from '../types';

interface WeatherIndicatorProps {
  weather: Weather | null;
}

const STORM_KEYWORDS = ['storm', 'thunder', 'rain', 'snow', 'sleet', 'ice', 'blizzard', 'hurricane', 'tornado'];

function isStormCondition(condition: string): boolean {
  const lower = condition.toLowerCase();
  return STORM_KEYWORDS.some((kw) => lower.includes(kw));
}

function getWeatherEmoji(condition: string): string {
  const lower = condition.toLowerCase();
  if (lower.includes('thunder')) return '⛈';
  if (lower.includes('snow') || lower.includes('blizzard')) return '🌨';
  if (lower.includes('rain') || lower.includes('sleet')) return '🌧';
  if (lower.includes('ice')) return '🧊';
  return '⚠';
}

export const WeatherIndicator: FC<WeatherIndicatorProps> = ({ weather }) => {
  if (!weather || !isStormCondition(weather.condition)) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 14px',
      background: 'rgba(20, 20, 20, 0.9)',
      borderRadius: 8,
      border: '1px solid rgba(255, 255, 255, 0.08)',
      fontSize: 13,
      color: '#ccc',
    }}>
      <span style={{ fontSize: 18 }}>{getWeatherEmoji(weather.condition)}</span>
      <span>{weather.condition} · {weather.temperature}°F</span>
    </div>
  );
};
```

- [ ] **Step 2: Add WeatherIndicator to App.tsx**

Import and render in the App component, below the NavBar:

```typescript
import { WeatherIndicator } from './WeatherIndicator';

// In the JSX, add after NavBar:
<WeatherIndicator weather={weather} />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/WeatherIndicator.tsx frontend/src/components/App.tsx
git commit -m "feat(frontend): add passive weather indicator during storms"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1: Setup + Backend | Tasks 1-10 | Monorepo scaffold, MBTA parsers, state manager, SSE streams, WS fan-out |
| 2: Frontend Core | Tasks 11-21 | Dark 3D map, route lines, station dots, animated train trails, tooltip, nav |
| 3: Interactivity | Tasks 22-23 | Station popup, departure board with geolocation |
| 4: Overlays | Tasks 24-26 | Alert layer, accessibility layer, alert banner |
| 5: Polish | Tasks 27-32 | Loading states, meta tags, env config, progress bar, weather widget, integration test |

**Total: 32 tasks, each completable in 2-10 minutes.**
