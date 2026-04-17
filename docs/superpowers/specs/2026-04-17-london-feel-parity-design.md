# London-Underground-Live Feel Parity — Design

**Date:** 2026-04-17
**Status:** Draft for review
**Scope:** Close the remaining perceptual gap between our MBTA live map and [londonunderground.live](https://www.londonunderground.live/). Audits (see the transcript of 2026-04-17) showed ~80% visual parity already; this spec addresses the remaining six items that drive the "warm, living, between-stations" feel.

## Goals

1. Hovering a moving train shows a **station-to-station progress fraction** that ticks up continuously (e.g. `42.7%` bar with `Park St → Charles/MGH`) rather than a whole-route progress.
2. Trains read as **warm saturated dots** on the cream basemap, not neon. Brand colors darkened ×0.7.
3. Trails feel like a comet tail — tuned to match the single-trail cadence of the reference site.
4. 3D tilt / right-click orbit available (`maxPitch: 85`, `dragRotate: true`).
5. Station hover enumerates the colored routes serving that station.

## Non-Goals

- Changing the data source (stay on MBTA v3 SSE + WS delta fan-out).
- Changing MBTA brand hex codes (keep `DA291C / 003DA5 / ED8B00 / 00843D`).
- Adding scheduled-timestamp reconstruction — our GPS feed is more accurate than London's prediction-reconstructed positions.
- Polling instead of WS; we keep WS.

## Architecture Overview

```
┌────────────────────────────────┐        ┌──────────────────────────────┐
│ backend/src/index.ts           │        │ frontend                     │
│                                │        │                              │
│  SSE vehicle event             │        │ store.vehicles               │
│    ├─ prev status cache ───┐   │   WS   │   ├─ lastDepartedStopId      │
│    ├─ enrich vehicle  ◄────┘   │ delta  │   ├─ lastDepartedAt          │
│    │   (+ lastDepartedStopId,  │ ────►  │   └─ existing fields …       │
│    │     lastDepartedAt)       │        │                              │
│    └─ coalescer.upsertVehicle  │        │ segmentProgress(v, now)      │
│                                │        │   └─ driven by rAF tick      │
│                                │        │                              │
│                                │        │ TrainTooltip                 │
│                                │        │   └─ FROM → TO  NN.N%        │
└────────────────────────────────┘        └──────────────────────────────┘
```

## Components

### 1. Backend: vehicle departure tracking

**File:** `backend/src/index.ts` (vehicle event handler near line 196).

Add an in-memory `Map<vehicleId, { stopId: string; at: number }>` keyed by vehicle id. On every vehicle event:

- If prior cached status was `STOPPED_AT` **and** incoming event is `IN_TRANSIT_TO` **or** `INCOMING_AT`, record `{ stopId: prev.stopId, at: Date.now() }` in the map.
- If cache is empty for this vehicle and current status is `IN_TRANSIT_TO`, fallback: infer `lastDepartedStopId` from previous stop in the trip's stop pattern via `referenceData.getSnapshot().trips` (already loaded) and set `at = updatedAt - etaSec` approximation. When we can't infer, leave undefined — the tooltip falls back to "Heading to <next>".
- Attach `lastDepartedStopId` and `lastDepartedAt` to the enriched vehicle.

Cleanup: when `coalescer.removeVehicle(id)` fires, delete the map entry (add a callback or inline in `onVehicleEvent` `remove` branch).

**Wire format:** append two fields to `Vehicle` in `backend/src/types.ts` and `frontend/src/types.ts`:

```ts
lastDepartedStopId?: string | null;
lastDepartedAt?: number | null; // epoch ms
```

Optional/nullable so old clients keep working and the enrichment is best-effort.

### 2. Frontend: `segmentProgress` util

**File:** `frontend/src/utils/segment-progress.ts` (new).

```ts
export interface SegmentProgress {
  fraction: number;        // clamped [0, 1]
  fromStopName: string | null;
  toStopName: string | null;
}

export function segmentProgress(
  vehicle: Vehicle,
  now: number,
  stopNameById: (id: string) => string | null,
): SegmentProgress;
```

Rules:

- If `vehicle.currentStatus === 'STOPPED_AT'` → `fraction: 0`, `fromStopName = vehicle.currentStopName`, `toStopName` = `vehicle.nextStops?.[0]?.stopName ?? null`.
- Else if `lastDepartedAt && nextStops?.[0]?.etaSec`:
  - `fromTs = lastDepartedAt`
  - `toTs = Date.parse(vehicle.updatedAt) + nextStops[0].etaSec * 1000` (`updatedAt` is ISO-8601 from MBTA)
  - `fraction = clamp((now - fromTs) / (toTs - fromTs), 0, 1)`
  - `fromStopName = stopNameById(lastDepartedStopId)`
  - `toStopName = nextStops[0].stopName`
- Else fallback to whole-route `progress` already on the vehicle (current behavior).

Unit tests cover each branch.

### 3. Frontend: tooltip swap

**File:** `frontend/src/overlays/TrainTooltip.tsx`.

Replace the existing "Progress along route" block with:

- Line 1: `{FROM}  →  {TO}` (muted arrow; station name bold)
- Line 2: progress bar tinted with route color + `NN.N%` right-aligned
- Progress updates on every rAF tick (already driven by `LiveMap`'s `playbackT` → pass `now` into tooltip via prop).

Keep the existing "Future Stops" list as-is. "Stopped at X" renders `fromStopName` bold, `toStopName` muted, bar at `0.0%`.

### 4. Frontend: `darkenColor` util + apply to train layers

**File:** `frontend/src/utils/color.ts` (new or extend existing).

```ts
export function darkenRgb(rgb: [number, number, number], factor: number): [number, number, number];
```

Applied in `LiveMap.tsx` when computing `trainDatums`:

- `glow` and `core` TripsLayer colors → darkened ×0.7
- head `Scatterplot` fill → darkened ×0.7; outline stays as is (dark ring reads cleanly)
- PathLayer (static routes) unchanged (already blended toward cream)

Delayed trains still switch to amber (`[255, 199, 44]`) then darken ×0.7 for consistency.

### 5. Frontend: trail retune

**File:** `frontend/src/components/LiveMap.tsx`.

Current: glow `trailLength: 45s`, `widthMinPixels: 4–10`; core `trailLength: 15.75s`, width `2–5`.

New:

- Glow: `trailLength: 25s`, width `5–9`, alpha bumped to 96/255 to keep halo visible on cream.
- Core: `trailLength: 10s`, width `2–4`.

Single-trail variant considered — stacked keeps more legibility on our busier subway network vs. London's sparser feed, so we retune rather than collapse. `fadeTrail: true` already set.

### 6. Frontend: camera + station hover

**File:** `LiveMap.tsx:110`.

- `maxPitch: 85` (was 60)
- `dragRotate: true` (default, verify)
- `pitchWithRotate: true` to couple Shift+drag + right-click

**File:** new/extend `frontend/src/overlays/StationTooltip.tsx`.

Station hover (pickable on the existing stations `ScatterplotLayer`) → floating tooltip listing `{stopName}` + chip per route in `stop.routeIds`, each chip filled with darkened brand color. Reuse existing route color util; reuse the floating-ui positioning the train tooltip already uses.

## Data Flow

```
SSE vehicle event
  └─ backend index.ts cache transition → attach lastDepartedStopId/at
       └─ coalescer.upsertVehicle
            └─ WS delta → frontend store
                 └─ LiveMap rAF tick (playbackT)
                      ├─ interpolateAlongPath (existing)
                      └─ segmentProgress(v, now) → tooltip
```

## Error Handling

- Missing `lastDepartedAt` / `nextStops[0].etaSec`: util returns `fraction = 0`, tooltip renders `Heading to {toStopName}` with no bar.
- Clock skew (server `updatedAt` > client now): clamp fraction `[0,1]`; no UI flicker.
- Stop name not in reference snapshot: display stop id as fallback (existing `getStopName` helper).
- Reference-data refresh in flight: unchanged — fallback path already returns raw vehicle without enrichment (backend index.ts:218).

## Testing

- **Backend unit test** for departure-transition cache:
  - `STOPPED_AT → IN_TRANSIT_TO` records prior stop.
  - `IN_TRANSIT_TO → IN_TRANSIT_TO` (different stop) does not record.
  - `remove` event clears cache.
- **Frontend unit test** `segmentProgress`:
  - STOPPED_AT → `fraction 0`
  - mid-segment → clamped fraction matches `(now - from) / (to - from)`
  - missing `lastDepartedAt` → falls back to whole-route progress
- **Frontend unit test** `darkenRgb`:
  - factor 1.0 → no change, factor 0.7 matches reference values, factor 0 → [0,0,0], clamps on out-of-range input.
- **Component test** `TrainTooltip` with stubbed vehicle renders `FROM → TO NN.N%` bar; updating `now` prop re-renders bar.
- **Smoke**: run `pnpm dev`, open http://localhost:5173, pick a red-line train, confirm tooltip updates continuously and the tilt works.

## File Inventory

New:
- `frontend/src/utils/segment-progress.ts`
- `frontend/src/utils/color.ts` (or extend an existing color util if one shows up)
- `frontend/src/overlays/StationTooltip.tsx`
- `frontend/test/utils/segment-progress.test.ts`
- `frontend/test/utils/color.test.ts`

Modified:
- `backend/src/index.ts` (vehicle event handler + departure cache)
- `backend/src/types.ts` (`Vehicle` fields)
- `frontend/src/types.ts` (`Vehicle` fields)
- `frontend/src/components/LiveMap.tsx` (trail + camera + pass `now` + hook up station tooltip)
- `frontend/src/overlays/TrainTooltip.tsx` (layout swap)
- `frontend/src/hooks/useMapLayers.ts` (if station pickable needs flag)

## Sequencing

Biggest perceptual shift first:

1. **Backend departure cache** (unlocks segment progress). No visible change yet.
2. **`segmentProgress` util + TrainTooltip swap**. Biggest user-visible change.
3. **`darkenColor` + apply to train layers**. Second-biggest visible shift.
4. **Trail retune**. Fine polish.
5. **maxPitch + dragRotate**. Tiny diff.
6. **Station hover tooltip**. Self-contained add.

Each step shippable independently.

## Open Questions

- `lastDepartedAt` inference when a vehicle first appears mid-trip (no prior `STOPPED_AT` observed): accept "fraction 0" until first stop observed, or reconstruct from `currentStopSequence - 1`? **Proposal:** accept fallback for first-observed cycle; most trains only reach us mid-run after app restart. Revisit if users flag it.
- Single 20s trail vs. stacked 25/10 — will verify visually in dev; spec assumes stacked retune.
