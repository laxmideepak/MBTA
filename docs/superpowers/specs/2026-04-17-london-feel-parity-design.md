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

Add an in-memory `Map<vehicleId, { stopId: string; at: number; lastSeen: number }>` keyed by vehicle id. On every vehicle event:

- Update `lastSeen = Date.now()` on any event for this id (so the TTL sweep can drop stale entries for trains MBTA silently dropped without a `remove` event).
- If prior cached status was `STOPPED_AT` **and** incoming event is `IN_TRANSIT_TO` **or** `INCOMING_AT`, record `{ stopId: prev.stopId, at: Date.now(), lastSeen: Date.now() }`.
- If cache is empty for this vehicle and current status is `IN_TRANSIT_TO`, fallback: infer `lastDepartedStopId` from previous stop in the trip's stop pattern via `referenceData.getSnapshot().trips` (already loaded). Leave `at` undefined — we don't fabricate a departure timestamp; the tooltip shows `Heading to <next>` without a percentage.
- Attach `lastDepartedStopId` and `lastDepartedAt` to the enriched vehicle.

**Cleanup / TTL:**
- When `coalescer.removeVehicle(id)` fires, delete the map entry.
- On a 5-minute `setInterval` (tracked + cleared in `shutdown()`), sweep entries whose `lastSeen` is older than 30 minutes and delete them. This catches trains MBTA dropped without a `remove` event (feed reconnect, trip_id reassignment at terminals, etc.) so the map cannot grow unbounded over multi-week uptimes.
- First-observed mid-run cases (app restart, terminal trip_id flip, feed reconnect) are expected — not rare. They all fall through to the fallback branch, which must render `Heading to <next>` (never `Stopped at undefined`). Tooltip component has a defensive guard for this.

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
- Else if `lastDepartedAt` is present:
  - `fromTs = lastDepartedAt` (server-origin epoch ms, already normalized — see "Time + clock skew" below).
  - `toTs` preference, in order:
    1. `Date.parse(prediction.arrivalTime)` for the prediction whose `stopId === nextStops[0].stopId` and whose `tripId === vehicle.tripId` (absolute MBTA-origin timestamp; no two-step reconstruction error).
    2. Fallback only when no matching prediction exists: `Date.parse(vehicle.updatedAt) + nextStops[0].etaSec * 1000`. Noted as lossy because `etaSec` is "from prediction's own `now`", which may differ from `updatedAt` by a few seconds.
  - `fraction = clamp((now - fromTs) / (toTs - fromTs), 0, 1)` (clamp is a safety net, not the skew fix — see below).
  - `fromStopName = stopNameById(lastDepartedStopId)`
  - `toStopName = nextStops[0].stopName`
- Else (`lastDepartedAt` unknown) → `fraction: null`; tooltip renders `Heading to {toStopName}` without a bar. Do NOT fall back to whole-route `progress` for segment display — it answers a different question and is misleading in this layout.

To access predictions the util takes a third argument: `predictionsByTripAndStop: (tripId: string, stopId: string) => Prediction | null`. Already available in the frontend store.

Unit tests cover: prediction-preferred path, etaSec fallback path, missing-departure path (returns `fraction: null`), STOPPED_AT path.

### 3. Frontend: tooltip swap

**File:** `frontend/src/overlays/TrainTooltip.tsx`.

Replace the existing "Progress along route" block with:

- Line 1: `{FROM}  →  {TO}` (muted arrow; station name bold). If `toStopName` is null, render `Heading to {fromStopName or 'station'}` as a single line. Never render literal `undefined` / empty strings.
- Line 2: progress bar tinted with route color + `NN.N%` right-aligned when `fraction !== null`. Hidden entirely when `fraction === null`.

**rAF ownership:** the tooltip itself owns the animation frame loop via a small `useAnimationFrame` hook that runs only while the tooltip is mounted. On unmount, the loop dies. `LiveMap` does NOT thread `now` through as a prop — that would trigger 60Hz diffs on the top-level map component even when the hover target is unchanged. The tooltip reads `serverOffsetMs` from the store and computes `serverNow = Date.now() + serverOffsetMs` inside the hook tick.

"Stopped at X" renders `fromStopName` bold, `toStopName` muted, bar hidden.

### 4. Frontend: `darkenColor` util + apply to train layers

**File:** `frontend/src/utils/color.ts` (new or extend existing).

```ts
export function darkenRgb(rgb: [number, number, number], factor: number): [number, number, number];
export const BRAND_DARKEN_FACTOR: Record<string, number>; // keyed by routeId, default 0.7
```

Rationale for per-route factors: MBTA's Red (`#DA291C`) is already darker than TfL's Central red (`#E32017`), so a uniform ×0.7 can push Red into muddy brown that stops reading as "Red Line" at glance. We expose a per-route override keyed by routeId with a 0.7 default. Initial values ship as:

```ts
BRAND_DARKEN_FACTOR = {
  // MBTA Red is already darker than TfL Central red; 0.78 preserves recognizability on cream.
  Red: 0.78,
  // Slight extra desaturation to keep Orange distinguishable from the amber delay marker.
  Orange: 0.72,
  // Standard 0.7 reads cleanly on cream.
  Blue: 0.7,
  // Green branches all share the same brand hex; use the standard 0.7 for every branch.
  'Green-B': 0.7, 'Green-C': 0.7, 'Green-D': 0.7, 'Green-E': 0.7,
  // Mattapan uses the Red-Line hex per MBTA branding, but the route is sparse enough
  // that the standard 0.7 reads fine; bump if it ever looks muddy.
  Mattapan: 0.7,
};
```

Spot-check at zoom 12 + zoom 15 against the cream base during implementation; tune if anything reads muddy. If no route-specific value exists, default to 0.7.

Applied in `LiveMap.tsx` when computing `trainDatums`:

- `glow` and `core` TripsLayer colors → darkened per route factor.
- head `Scatterplot` fill → darkened per route factor; outline stays `[11, 18, 27, 220]` (dark ring reads cleanly).
- PathLayer (static routes) unchanged (already blended toward cream).

Delayed trains still switch to amber (`[255, 199, 44]`) then darken with a constant `AMBER_DARKEN = 0.8` (less aggressive because amber is already warm).

### 5. Frontend: trail retune

**File:** `frontend/src/components/LiveMap.tsx`.

Current: glow `trailLength: 45s`, `widthMinPixels: 4–10`; core `trailLength: 15.75s`, width `2–5`.

New:

- Glow: `trailLength: 25s`, width `5–9`, alpha bumped to 96/255 to keep halo visible on cream.
- Core: `trailLength: 10s`, width `2–4`.

Single-trail variant considered — stacked keeps more legibility on our busier subway network vs. London's sparser feed, so we retune rather than collapse. `fadeTrail: true` already set.

**Density decision rule (pre-committed, auditable, not "we'll eyeball it"):**

1. After applying the retune, open http://localhost:5173 during rush hour (or replay fixture).
2. Zoom to Park St + Downtown Crossing; capture **screenshot A = stacked (25s / 10s)**.
3. Apply the single-trail fallback (`trailLength: 20s`, `widthMinPixels: 7`), capture **screenshot B = single**.
4. If in screenshot A you can distinguish individual train directions from arm's length (~2 ft), stacked stays. Otherwise collapse to single.
5. Attach both screenshots to the PR description so the reviewer can sanity-check the call.

### 6. Frontend: camera + station hover

**File:** `LiveMap.tsx:110`.

- `maxPitch: 85` (was 60) — raises the ceiling so right-click-drag can tilt to the low-angle 3D view the reference site uses.
- `dragRotate: true` (MapLibre default — assert it, don't flip it, to prevent accidental regression).
- `pitchWithRotate: true` — also a MapLibre default. Explicitly keeps pitch coupled to right-click-drag rotation (so the same gesture that spins the map also tilts it). It does NOT affect Shift+drag, which is a separate pan gesture.

**File:** new/extend `frontend/src/overlays/StationTooltip.tsx`.

Station hover (pickable on the existing stations `ScatterplotLayer`) → floating tooltip listing `{stopName}` + chip per route in `stop.routeIds`, each chip filled with the darkened brand color via `darkenRgb` + `BRAND_DARKEN_FACTOR`. Reuse existing route color util; reuse the floating-ui positioning the train tooltip already uses.

**Tooltip coordination (train + station must not fight):** there can be at most one tooltip visible. Implementation: hover state lives in a single `useHoveredEntity` hook returning a discriminated union `{ kind: 'train'; vehicle } | { kind: 'station'; stop } | null`. The rendered component switches on `kind`. Station picks are suppressed while a train tooltip is pinned open (click-to-pin already exists). This is cheaper than threading z-index / mutual exclusion logic through two independent components.

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

- Missing `lastDepartedAt`: util returns `fraction: null`; tooltip renders `Heading to {toStopName}` without a bar (no fake 0% pinning).
- Stop name not in reference snapshot: display stop id as fallback (existing `getStopName` helper). Never render literal `undefined` in the tooltip — `TrainTooltip` falls back to `Heading to …` when either side is unresolved.
- Reference-data refresh in flight: unchanged — fallback path already returns raw vehicle without enrichment (backend index.ts:218).

### Time + clock skew

Mixing `Date.now()` (client clock) with server-origin `updatedAt` / `arrivalTime` is the single biggest source of wrong percentages. Rules:

- **All timestamps on the wire are server-origin** (MBTA → backend → WS). Frontend treats them as the source of truth for "when in MBTA time."
- On WS connect, the server stamps the initial `full-state` message with `timestamp: Date.now()` (already present). The client computes `serverOffsetMs = serverTimestamp - Date.now()` once per connection and stores it on the store.
- Every subsequent use of "now" in `segmentProgress` — and any other comparison against server-origin timestamps — uses `serverNow = Date.now() + serverOffsetMs`, not raw `Date.now()`.
- `clamp([0, 1])` on the computed fraction stays as a defensive backstop but is not the primary skew mitigation.
- On WS reconnect, recompute the offset from the new `full-state`. The heartbeat (`timestamp` every 10s) is also valid input if a drift correction becomes necessary later; v1 uses connect-time offset only for simplicity.
- On WS `close` the client clears `serverOffsetMs` to `null`. `segmentProgress` treats null offset as "unknown" and returns `fraction: null` until the next `full-state` reestablishes it — the tooltip degrades to `Heading to …` for the ~100–500 ms reconnect window instead of rendering a confidently-wrong percentage computed from a stale offset.

## Testing

- **Backend unit test** for departure-transition cache:
  - `STOPPED_AT → IN_TRANSIT_TO` records prior stop and `at` timestamp.
  - `IN_TRANSIT_TO → IN_TRANSIT_TO` (different stop) does not record.
  - `IN_TRANSIT_TO → STOPPED_AT` (arrival at next station) does NOT update the cache — the prior departure becomes stale the instant the vehicle reaches the next stop; the entry remains until the next `STOPPED_AT → IN_TRANSIT_TO` transition overwrites it.
  - `remove` event clears cache.
- **Frontend unit test** `segmentProgress`:
  - STOPPED_AT → `fraction: 0`
  - mid-segment with matching prediction → fraction uses `prediction.arrivalTime` (absolute)
  - mid-segment without matching prediction → fraction uses `updatedAt + etaSec` fallback; result differs from the prediction-preferred result numerically
  - missing `lastDepartedAt` → returns `fraction: null` (tooltip renders `Heading to …` without a bar — asserted in the component test)
  - null `serverOffsetMs` → returns `fraction: null` (tooltip shows `Heading to …` until offset reestablishes)
- **Frontend unit test** `darkenRgb`:
  - factor 1.0 → no change, factor 0.7 matches reference values, factor 0 → [0,0,0], clamps on out-of-range input.
- **Component test** `TrainTooltip`:
  - Mounted with stubbed `segmentProgress` returning increasing fractions → bar fill advances across rAF frames (drive with `vi.useFakeTimers()` or a mocked `requestAnimationFrame`).
  - Unmount cancels the rAF loop — assert via a spied `cancelAnimationFrame`.
  - `fraction: null` branch → renders `Heading to {toStopName}` with no progress bar in the DOM.
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

1. **Backend departure cache + wire-format fields + frontend `serverOffsetMs`** (prep). No visible change yet.
2. **`segmentProgress` util + TrainTooltip swap**. Biggest user-visible change.
3. **`darkenColor` + apply to train layers**. Second-biggest visible shift.
4. **Trail retune** (with density screenshot). Fine polish.
5. **maxPitch + dragRotate** (one-line change). Tiny diff.
6. **Station hover tooltip + shared hover state**. Self-contained add.

**Ship pairing:** Steps 1 and 2 ship **together**. Shipping Step 1 alone adds `lastDepartedStopId` / `lastDepartedAt` to the `Vehicle` type on both sides of the wire without a reader — anyone editing vehicle shape in the gap inherits a half-used field. Steps 3, 4, 5, 6 are each independently shippable after 1+2 lands.

## Open Questions

- First-observed mid-run vehicles (app restart, feed reconnect, trip_id flip at terminal): spec resolves to `fraction: null` + `Heading to {next}`. Revisit only if user feedback says the unlabeled bar is missed more than 10% of hovers.
- Stacked trail vs. single-trail collapse: resolved by the Park St density check in Step 4 verification — capture the screenshot, decide then, amend this spec with the final values.

## Testing additions (time + coordination)

- **Backend unit test** for departure-cache TTL sweep: entry whose `lastSeen` is older than 30 min is removed on the sweep tick; recent entry is retained.
- **Frontend unit test** for clock-skew correction: with a stubbed `serverOffsetMs = 30_000`, `segmentProgress` called with `now = Date.now()` produces the same fraction it would with a skewless clock.
- **Frontend unit test** for prediction-preferred `toTs`: when a matching prediction exists, util uses `prediction.arrivalTime`; when not, falls back to `updatedAt + etaSec`; difference is asserted numerically.
- **Component test** for tooltip coordination: simultaneous train-hover + station-hover resolves to one tooltip, not two.
