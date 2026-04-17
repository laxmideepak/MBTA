# London-Underground-Live Feel Parity — Implementation Plan

**Spec:** [2026-04-17-london-feel-parity-design.md](../specs/2026-04-17-london-feel-parity-design.md) (v3)
**Branch:** `cursor/optional-api-key-dev-defaults` (current)
**Dev server:** already running at http://localhost:5173 (task `b7j8h6jgz`)

## Context for every subagent

- MBTA realtime transit app. Node/TypeScript backend (SSE → WS delta fan-out), Vite/React frontend (MapLibre + deck.gl).
- Backend code: `backend/src/`. Frontend code: `frontend/src/`.
- WebSocket wire types: `backend/src/types.ts` + `frontend/src/types.ts` (kept in lock-step).
- Frontend store: `frontend/src/store/systemStore.ts` (Zustand, WS handler inside).
- Tests: backend `backend/test/*.test.ts` (vitest), frontend `frontend/test/*.test.ts(x)` (vitest + @testing-library/react).
- Lint: biome. Run `pnpm lint` at repo root after every change.
- Do NOT touch `backend/src/reference-data.ts` — it has a pre-existing uncommitted diff that belongs to another branch's work.
- Commit style (see `git log --oneline`): conventional commits, imperative subject ≤72 chars, body explains why, include `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` footer.
- Each subagent must:
  - Use TDD: write failing test → implement → watch it pass.
  - Run `pnpm -r test` + `pnpm lint` before committing.
  - Create ONE commit per task (except Task 1, which defers commit to Task 2 — they ship paired).
  - Report DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED at end.

---

## Task 1 — Backend departure-cache + wire fields + frontend serverOffsetMs (no visible change)

**Goal:** Land all the plumbing that Task 2 reads from. Do NOT commit at end of this task — commit happens at end of Task 2 so the wire fields never ship without a reader.

### 1a. Extend wire types

- `backend/src/types.ts` and `frontend/src/types.ts`: append to `Vehicle`:
  ```ts
  lastDepartedStopId?: string | null;
  lastDepartedAt?: number | null; // epoch ms, server-origin
  ```
  Both files must stay in lock-step.

### 1b. Backend departure-cache

File: `backend/src/vehicle-departure-cache.ts` (new module — keep the cache out of `index.ts` so it has a clean unit-test surface).

Export a `VehicleDepartureCache` class with:

```ts
interface DepartureEntry { stopId: string; at: number; lastSeen: number; }
class VehicleDepartureCache {
  onEvent(vehicleId: string, prevStatus: Vehicle['currentStatus'] | undefined, next: Vehicle, now: number): DepartureEntry | null;
  get(vehicleId: string): DepartureEntry | null;
  remove(vehicleId: string): void;
  sweep(now: number, ttlMs: number): number; // returns #entries removed
}
```

Rules inside `onEvent`:
- Always update `lastSeen = now` for the vehicle id (whether or not we record a new departure).
- Record `{ stopId: prevStop, at: now, lastSeen: now }` **only** when `prevStatus === 'STOPPED_AT'` AND `next.currentStatus` is `IN_TRANSIT_TO` or `INCOMING_AT`. The stop we record is the prior `STOPPED_AT` stopId, which you must track inside this module (store `prevStatus` + `prevStopId` per vehicle).
- `IN_TRANSIT_TO → STOPPED_AT`: do NOT update the departure entry (the prior departure stays until the next stop→transit transition overwrites it). Still update `lastSeen`.
- `IN_TRANSIT_TO → IN_TRANSIT_TO` (even different stopId): do NOT record.

### 1c. Wire cache into `index.ts`

In the vehicle event handler (around `backend/src/index.ts:196`):

- Instantiate the cache at module scope: `const departureCache = new VehicleDepartureCache();`
- On every `add` / `update` / `reset` event, call `departureCache.onEvent(id, prevStatus, vehicle, Date.now())` before enriching.
- Enrichment: when attaching `currentStopName / routeColor / destination`, also read `departureCache.get(v.id)` and attach `lastDepartedStopId` + `lastDepartedAt`. Leave them as `null` if no entry exists.
- On `remove` events call `departureCache.remove(id)`.
- After `resetVehicles`, cache must be rebuilt (call `onEvent` for each vehicle with no `prev` — the first event for a vehicle never records, only seeds state).

### 1d. TTL sweep

- In `index.ts`, inside `start()`: `const sweepId = setInterval(() => departureCache.sweep(Date.now(), 30 * 60 * 1000), 5 * 60 * 1000);`.
- Track `sweepId` + `clearInterval(sweepId)` in the existing `shutdown()` handler.

### 1e. Frontend serverOffsetMs

File: `frontend/src/store/systemStore.ts` (or wherever WS handling lives — confirm by grep).

- Add store field `serverOffsetMs: number | null` (initial `null`).
- On WS `full-state` message: `set({ serverOffsetMs: data.timestamp - Date.now() })`.
- On WS `close` handler: `set({ serverOffsetMs: null })`.
- Export a selector hook `useServerNow()` returning `() => Date.now() + (serverOffsetMs ?? 0)` when the offset is non-null, else `null`.

### 1f. Tests

New: `backend/test/vehicle-departure-cache.test.ts`

- `STOPPED_AT → IN_TRANSIT_TO` records prior stop and `at` timestamp.
- `STOPPED_AT → INCOMING_AT` also records.
- `IN_TRANSIT_TO → IN_TRANSIT_TO` (different stopId) does not record.
- `IN_TRANSIT_TO → STOPPED_AT` (arrival) does NOT update the departure entry; the earlier entry remains intact.
- `remove` clears the entry.
- `sweep(now, 30*60*1000)` drops entries whose `lastSeen` is older than 30 min; retains recent.
- First event for an unseen vehicle id records no entry.

No frontend test in this task — segment-progress + tooltip tests land in Task 2.

### 1g. Deliverable

Tests green (`pnpm --filter backend test` passes). `pnpm -r test` still green overall. Lint clean. Typecheck clean. **No commit yet.** Hand off to Task 2 with a summary of the working tree state.

---

## Task 2 — Frontend `segmentProgress` + TrainTooltip rewrite (single commit with Task 1)

**Goal:** Ship the visible change — hover a moving train, see `FROM → TO NN.N%` bar ticking up in real time.

### 2a. `segmentProgress` util

File: `frontend/src/utils/segment-progress.ts` (new).

```ts
import type { Vehicle, Prediction } from '../types';

export interface SegmentProgress {
  fraction: number | null;
  fromStopName: string | null;
  toStopName: string | null;
}

export interface SegmentProgressInput {
  vehicle: Vehicle;
  now: number | null; // server-corrected epoch ms, or null when serverOffsetMs unknown
  stopName: (id: string | null | undefined) => string | null;
  prediction: (tripId: string, stopId: string) => Prediction | null;
}

export function segmentProgress(input: SegmentProgressInput): SegmentProgress;
```

Implementation rules (verbatim from spec §2):

1. If `now === null` → `{ fraction: null, fromStopName: null, toStopName: vehicle.nextStops?.[0]?.stopName ?? null }`.
2. If `vehicle.currentStatus === 'STOPPED_AT'` → `{ fraction: 0, fromStopName: vehicle.currentStopName ?? null, toStopName: vehicle.nextStops?.[0]?.stopName ?? null }`.
3. If `lastDepartedAt != null` AND `nextStops?.[0]`:
   - Prefer `prediction(tripId, nextStops[0].stopId)?.arrivalTime` → `toTs = Date.parse(arrivalTime)`.
   - Fallback: `toTs = Date.parse(vehicle.updatedAt) + nextStops[0].etaSec * 1000`.
   - `fromTs = vehicle.lastDepartedAt`.
   - `fraction = clamp((now - fromTs) / Math.max(1, toTs - fromTs), 0, 1)`.
   - `fromStopName = stopName(vehicle.lastDepartedStopId)`.
   - `toStopName = vehicle.nextStops[0].stopName`.
4. Else → `{ fraction: null, fromStopName: null, toStopName: vehicle.nextStops?.[0]?.stopName ?? null }`.

### 2b. `useAnimationFrame` hook

File: `frontend/src/hooks/useAnimationFrame.ts` (new).

```ts
export function useAnimationFrame(tick: (frameNow: number) => void): void;
```

Uses `requestAnimationFrame` on mount, `cancelAnimationFrame` on unmount. `tick` receives the rAF timestamp. Keep a ref to the latest `tick` to avoid re-arming the loop when the callback identity changes.

### 2c. TrainTooltip rewrite

File: `frontend/src/overlays/TrainTooltip.tsx`.

- Remove the existing "Progress along route" block (look for `progress` / `progressVelocity` usage around line 388–393 per audit).
- Add internal state: `const [progress, setProgress] = useState<SegmentProgress>(initial);`
- Call `useAnimationFrame` to:
  - `const now = useServerNow()();` (returns `number | null`)
  - `setProgress(segmentProgress({ vehicle, now, stopName, prediction }))`
  - Skip `setProgress` if the new value is equal (cheap ref-equality on all three fields) to avoid re-renders when the integer-tenths percent hasn't moved.
- Render:
  - If `progress.fromStopName && progress.toStopName && progress.fraction != null`:
    - Line 1: `<strong>{fromStopName}</strong>  →  <strong>{toStopName}</strong>`
    - Line 2: colored progress bar at `fraction * 100%` width + `NN.N%` label.
  - Else if `progress.toStopName`: `Heading to <strong>{toStopName}</strong>` — no bar.
  - Else: fallback to the existing "Future Stops"-only layout.
- Never render literal `undefined` or an empty string for a station name.

Remove any `now` / `progress` props that used to come from `LiveMap`. Update `LiveMap.tsx` callsite to drop those props.

### 2d. Tests

New: `frontend/test/utils/segment-progress.test.ts`

- `now: null` → `fraction: null`.
- STOPPED_AT → `fraction: 0` + correct `fromStopName`.
- Mid-segment with matching prediction → fraction matches `(now - from) / (parse(arrivalTime) - from)`.
- Mid-segment without prediction → falls back to `updatedAt + etaSec`; numerical difference asserted.
- Missing `lastDepartedAt` → `fraction: null`.
- Out-of-range inputs clamp to `[0, 1]`.

New: `frontend/test/hooks/useAnimationFrame.test.tsx`

- Mounted hook fires `tick` on each rAF frame (use `vi.useFakeTimers()` + `vi.stubGlobal('requestAnimationFrame', ...)`).
- Unmount calls `cancelAnimationFrame` (assert via spy).

Update: `frontend/test/components/TrainTooltip.test.tsx` (or create if missing — audit said file exists)

- Mounted tooltip with a stubbed `segmentProgress` returning `{ fraction: 0.1, … }`, `{ fraction: 0.3, … }`, … across frames → the `.progress-bar` element's inline `width` advances.
- Unmount → spied `cancelAnimationFrame` called with the rAF handle.
- `fraction: null` branch → no `.progress-bar` in DOM; renders text starting with `Heading to `.

### 2e. Verify + commit (combined with Task 1)

1. `pnpm -r test` all green.
2. `pnpm lint` clean.
3. `pnpm --filter frontend build && pnpm --filter backend build` both succeed.
4. Manually open http://localhost:5173 in a browser (dev server already running). Hover a moving train. Confirm tooltip shows `FROM → TO NN.N%` and the percentage visibly advances.
5. ONE commit covering Task 1 + Task 2. Suggested subject: `feat(ui): station-to-station progress in train tooltip` with a body that lists both the wire-format additions and the frontend rewrite.

---

## Task 3 — Darken train brand colors

**Goal:** Trains read as warm saturated dots on cream, not neon.

### 3a. Util

File: `frontend/src/utils/color.ts` (new or extend existing — grep for `rgb` / `color` utils first).

```ts
export function darkenRgb(rgb: [number, number, number], factor: number): [number, number, number];
export const BRAND_DARKEN_FACTOR: Record<string, number>;
export const AMBER_DARKEN = 0.8;
```

Per-route factors copied verbatim from the spec's annotated table (include the rationale comments).

### 3b. Apply

File: `frontend/src/components/LiveMap.tsx`. Locate `trainDatums` / train layer color computation (audit references line 208–289). For each train datum:

- `color = darkenRgb(baseColor, BRAND_DARKEN_FACTOR[vehicle.routeId] ?? 0.7)`
- Apply to BOTH glow `TripsLayer` color and core `TripsLayer` color and head `ScatterplotLayer` `getFillColor`.
- Outline on the head scatter stays `[11, 18, 27, 220]` (unchanged).
- Delayed vehicles: replace base with amber `[255, 199, 44]` then `darkenRgb(amber, AMBER_DARKEN)`.
- PathLayer static tracks: UNCHANGED (they are already blended toward cream in `useMapLayers.ts`).

### 3c. Tests

New: `frontend/test/utils/color.test.ts`

- `darkenRgb([200, 100, 50], 1.0)` → unchanged.
- `darkenRgb([200, 100, 50], 0.7)` → `[140, 70, 35]` (rounded).
- `darkenRgb([200, 100, 50], 0)` → `[0, 0, 0]`.
- Out-of-range input `[300, -10, 128]` → clamps each channel to `[0, 255]` then applies factor.
- `BRAND_DARKEN_FACTOR.Red === 0.78`, `Blue === 0.7`, etc. (spot-check).

### 3d. Commit

Subject: `feat(map): darken train brand colors for cream basemap parity`.

---

## Task 4 — Trail retune + density screenshots

**Goal:** Comet-tail trail closer to the reference site.

### 4a. Tune glow + core

File: `frontend/src/components/LiveMap.tsx`. Change the stacked-trail parameters:

- Glow: `trailLength: 25` (was 45), `widthMinPixels: 5` (was 4), `widthMaxPixels: 9` (was 10), alpha bumped to `96` in the color tuple.
- Core: `trailLength: 10` (was 15.75), `widthMinPixels: 2` (unchanged), `widthMaxPixels: 4` (was 5).
- `fadeTrail: true` already set — confirm, don't toggle.

### 4b. Density check (decision rule)

Per spec §5:

1. Dev server is already up. Open http://localhost:5173 in a browser.
2. Wait for rush hour or pick a fixture with many concurrent vehicles.
3. Zoom to Park St + Downtown Crossing. Screenshot A = stacked (25 / 10).
4. Temporarily set to single trail (`trailLength: 20`, `widthMinPixels: 7`, drop the core layer). Screenshot B = single.
5. If screenshot A lets you distinguish individual train directions from arm's length, keep stacked. Else collapse to single — update the code AND the spec's "Trail retune" section to reflect the final values.
6. Revert any temporary screenshot-only code.
7. Save both screenshots to `/tmp/mbta-density-A.png` and `/tmp/mbta-density-B.png` and reference them in the commit body.

### 4c. Tests

No unit test — this is purely visual tuning. Existing tests must still pass.

### 4d. Commit

Subject: `feat(map): retune train trail for comet-tail feel on cream`.
Body must reference both screenshots and state the decision taken (stacked kept vs. collapsed to single).

---

## Task 5 — Camera: maxPitch + dragRotate + pitchWithRotate assert

**Goal:** Right-click-drag can tilt to low-angle 3D view.

### 5a. Edit map init

File: `frontend/src/components/LiveMap.tsx` around line 110 (audit).

- `maxPitch: 85` (was 60).
- `dragRotate: true` — add explicitly (it's the default; asserting prevents regression).
- `pitchWithRotate: true` — add explicitly.
- Add a one-line comment above the block: `// Couple right-click-drag rotate + pitch for london-style 3D orbit.`

### 5b. Tests

No unit test (MapLibre init isn't meaningfully testable in jsdom). Existing tests must still pass.

### 5c. Commit

Subject: `feat(map): enable right-click tilt for 3D orbit view`.

---

## Task 6 — Station hover tooltip + shared `useHoveredEntity`

**Goal:** Hover a station → floating chip-list of routes serving it. Cannot collide with train tooltip.

### 6a. Shared hover-state hook

File: `frontend/src/hooks/useHoveredEntity.ts` (new).

```ts
type HoveredEntity =
  | { kind: 'train'; vehicle: Vehicle; pixel: [number, number] }
  | { kind: 'station'; stop: Stop; pixel: [number, number] }
  | null;

export function useHoveredEntity(): {
  hovered: HoveredEntity;
  setHoveredTrain: (v: Vehicle | null, pixel?: [number, number]) => void;
  setHoveredStation: (s: Stop | null, pixel?: [number, number]) => void;
  pin: () => void;
  pinned: boolean;
};
```

- Only one entity visible at a time (whichever was set most recently).
- While `pinned === true`, station hovers are suppressed (train tooltip stays).
- Move `LiveMap`'s existing train-hover state into this hook; replace its usages.

### 6b. StationTooltip component

File: `frontend/src/overlays/StationTooltip.tsx` (new).

- Floats near the picked pixel (reuse `@floating-ui/react` positioning the train tooltip already uses — import pattern from `TrainTooltip.tsx`).
- Content: bold station name, then one small chip per route in `stop.routeIds`:
  - Chip background = `darkenRgb(routeColor, BRAND_DARKEN_FACTOR[routeId] ?? 0.7)` with alpha.
  - Chip label = short route name (Red / Orange / Blue / Green B/C/D/E / Mattapan).
- Accessible: `role="tooltip"`, labelled by the hover target.

### 6c. Wire up station pickability

File: `frontend/src/hooks/useMapLayers.ts`. The stations `ScatterplotLayer` — set `pickable: true` if not already. In `LiveMap.tsx` `onHover` / `onClick` dispatcher, route `object.kind === 'stop'` picks to `setHoveredStation`.

### 6d. Render switch

File: `frontend/src/components/LiveMap.tsx`. Replace the existing `<TrainTooltip>` rendering with a switch on `hovered.kind`:

```tsx
{hovered?.kind === 'train' && <TrainTooltip vehicle={hovered.vehicle} pixel={hovered.pixel} />}
{hovered?.kind === 'station' && !pinned && <StationTooltip stop={hovered.stop} pixel={hovered.pixel} />}
```

### 6e. Tests

New: `frontend/test/hooks/useHoveredEntity.test.tsx`

- Setting a train, then a station → hovered is the station.
- Setting a station, then a train → hovered is the train.
- Clearing both → hovered is null.
- Pin + station-hover → hovered stays on pinned train.

New: `frontend/test/overlays/StationTooltip.test.tsx`

- Renders station name bold.
- Renders one chip per route in `stop.routeIds`; chip background uses the darkened color.

### 6f. Commit

Subject: `feat(map): station hover tooltip with route chips`.

---

## Final verification

After Task 6 commits:

1. `pnpm -r test` — all green (expect ~140+ tests).
2. `pnpm lint` — clean.
3. `pnpm --filter frontend build && pnpm --filter backend build` — both succeed.
4. Manual smoke at http://localhost:5173:
   - Hover a moving train → `FROM → TO NN.N%` bar ticks up in real time.
   - Right-click-drag tilts the map down to ~3D view.
   - Hover a station → chip-list tooltip appears.
   - Disconnect network briefly → after reconnect, tooltip briefly shows `Heading to …` then resumes `NN.N%`.
5. If density decision changed anything in Task 4, both screenshots attached and referenced.
6. Push branch. Dispatch final code-reviewer subagent over the full range of commits for this feature.
