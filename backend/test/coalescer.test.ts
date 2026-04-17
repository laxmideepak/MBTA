import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Coalescer } from '../src/coalescer.js';
import { StateManager } from '../src/state-manager.js';
import type { Alert, Prediction, Vehicle } from '../src/types.js';

function mkVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'v-default',
    routeId: 'Red',
    latitude: 42.3555,
    longitude: -71.0565,
    bearing: 180,
    currentStatus: 'IN_TRANSIT_TO',
    stopId: 'place-pktrm',
    currentStopSequence: 5,
    directionId: 0,
    label: '1234',
    tripId: 'trip-100',
    updatedAt: '2026-04-06T12:00:00-04:00',
    ...overrides,
  };
}

function mkPrediction(overrides: Partial<Prediction> = {}): Prediction {
  return {
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
    ...overrides,
  };
}

function mkAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'alert-1',
    effect: 'SHUTTLE',
    cause: 'MAINTENANCE',
    header: 'Test alert',
    shortHeader: 'Short header',
    serviceEffect: 'Shuttle service',
    timeframe: null,
    banner: null,
    description: 'Test description',
    severity: 7,
    lifecycle: 'ONGOING',
    url: null,
    activePeriod: [{ start: '2026-04-06T05:00:00-04:00', end: null }],
    informedEntities: [
      { routeId: 'Red', stopId: null, directionId: null, routeType: 1, activities: ['RIDE'] },
    ],
    createdAt: null,
    updatedAt: '2026-04-06T08:00:00-04:00',
    ...overrides,
  };
}

class FakeTimer {
  private t = 0;
  private nextId = 1;
  private timers: Array<{ id: number; fireAt: number; fn: () => void }> = [];
  readonly scheduleCalls: number[] = [];

  now = (): number => this.t;

  setTimeoutFn = (fn: () => void, delay: number): ReturnType<typeof setTimeout> => {
    this.scheduleCalls.push(delay);
    const id = this.nextId++;
    this.timers.push({ id, fireAt: this.t + delay, fn });
    return id as ReturnType<typeof setTimeout>;
  };

  clearTimeoutFn = (id: ReturnType<typeof setTimeout>): void => {
    const n = id as number;
    this.timers = this.timers.filter((x) => x.id !== n);
  };

  advance(ms: number): void {
    this.t += ms;
    for (;;) {
      const due = this.timers
        .filter((x) => x.fireAt <= this.t)
        .sort((a, b) => a.fireAt - b.fireAt || a.id - b.id);
      if (due.length === 0) break;
      for (const d of due) {
        this.timers = this.timers.filter((x) => x.id !== d.id);
        d.fn();
      }
    }
  }

  pendingCount(): number {
    return this.timers.length;
  }
}

type DeltaPayload = {
  vehicles: { reset?: Vehicle[]; updated?: Vehicle[]; removed?: string[] };
  predictions: { reset?: Record<string, Prediction[]>; updated?: Prediction[]; removed?: string[] };
  alerts: { reset?: Alert[]; updated?: Alert[]; removed?: string[] };
};

describe('Coalescer', () => {
  let state: StateManager;
  let clock: FakeTimer;
  let deltaCalls: DeltaPayload[];

  beforeEach(() => {
    state = new StateManager();
    clock = new FakeTimer();
    deltaCalls = [];
  });

  function makeCoalescer(): Coalescer {
    return new Coalescer(
      state,
      {
        broadcastDelta: vi.fn((data: unknown) => {
          deltaCalls.push(data as DeltaPayload);
        }),
      },
      {
        intervalMs: 250,
        now: clock.now,
        setTimeoutFn: clock.setTimeoutFn,
        clearTimeoutFn: clock.clearTimeoutFn,
      },
    );
  }

  it('1. upsertVehicle does not call broadcaster synchronously', () => {
    const c = makeCoalescer();
    c.upsertVehicle(mkVehicle({ id: 'v1' }));
    expect(deltaCalls).toHaveLength(0);
  });

  it('2. after advance(250), one delta flush contains vehicle update', () => {
    const c = makeCoalescer();
    c.upsertVehicle(mkVehicle({ id: 'v1' }));
    clock.advance(250);
    expect(deltaCalls).toHaveLength(1);
    expect(deltaCalls[0].vehicles.updated?.map((v) => v.id)).toEqual(['v1']);
  });

  it('3. 50 sync upserts schedule once; after advance(250) delta has 50 updated', () => {
    const c = makeCoalescer();
    for (let i = 0; i < 50; i++) {
      c.upsertVehicle(mkVehicle({ id: `v${i}`, label: String(i) }));
    }
    expect(clock.scheduleCalls).toHaveLength(1);
    clock.advance(250);
    expect(deltaCalls).toHaveLength(1);
    expect(deltaCalls[0].vehicles.updated).toHaveLength(50);
  });

  it('4. upsert vehicle+prediction+alert sync: advance(250) → one delta has all three slices', () => {
    const c = makeCoalescer();
    c.upsertVehicle(mkVehicle({ id: 'v1' }));
    c.upsertPrediction(mkPrediction({ id: 'p1' }));
    c.upsertAlert(mkAlert({ id: 'a1' }));
    clock.advance(250);
    expect(deltaCalls).toHaveLength(1);
    expect(deltaCalls[0].vehicles.updated).toHaveLength(1);
    expect(deltaCalls[0].predictions.updated).toHaveLength(1);
    expect(deltaCalls[0].alerts.updated).toHaveLength(1);
  });

  it('5. two flushes: second scheduled delay is 240', () => {
    const c = makeCoalescer();
    c.upsertVehicle(mkVehicle({ id: 'v1' }));
    clock.advance(250);

    clock.advance(10);
    c.upsertVehicle(mkVehicle({ id: 'v2' }));
    expect(clock.scheduleCalls[1]).toBe(240);
    clock.advance(240);
    expect(deltaCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('6. manual flush() after scheduling: delta broadcast, no pending timers', () => {
    const c = makeCoalescer();
    c.upsertVehicle(mkVehicle({ id: 'v1' }));
    c.flush();
    expect(deltaCalls).toHaveLength(1);
    expect(clock.pendingCount()).toBe(0);
  });

  it('7. flush() on fresh coalescer: no broadcast', () => {
    const c = makeCoalescer();
    c.flush();
    expect(deltaCalls).toHaveLength(0);
  });

  it('8. vehicle LWW: three upserts same id different label → one updated with last label', () => {
    const c = makeCoalescer();
    c.upsertVehicle(mkVehicle({ id: 'same', label: 'a' }));
    c.upsertVehicle(mkVehicle({ id: 'same', label: 'b' }));
    c.upsertVehicle(mkVehicle({ id: 'same', label: 'c' }));
    clock.advance(250);
    expect(deltaCalls).toHaveLength(1);
    expect(deltaCalls[0].vehicles.updated).toHaveLength(1);
    expect(deltaCalls[0].vehicles.updated?.[0]?.label).toBe('c');
  });

  it('9. upsert then remove same id → only removed contains id', () => {
    const c = makeCoalescer();
    c.upsertVehicle(mkVehicle({ id: 'x' }));
    c.removeVehicle('x');
    clock.advance(250);
    expect(deltaCalls).toHaveLength(1);
    expect(deltaCalls[0].vehicles.removed).toEqual(['x']);
    expect(deltaCalls[0].vehicles.updated ?? []).toHaveLength(0);
  });

  it('10. resetVehicles [v1], flush; remove v1 then upsert v1 → second flush only updated', () => {
    const v1 = mkVehicle({ id: 'v1' });
    const c = makeCoalescer();
    c.resetVehicles([v1]);
    clock.advance(250);
    c.removeVehicle('v1');
    c.upsertVehicle(v1);
    clock.advance(250);
    expect(deltaCalls).toHaveLength(2);
    expect(deltaCalls[1].vehicles.updated).toHaveLength(1);
    expect(deltaCalls[1].vehicles.removed ?? []).toHaveLength(0);
  });

  it('11. upsert+remove+resetVehicles before flush → vehicles.reset wins', () => {
    const a = mkVehicle({ id: 'a' });
    const b = mkVehicle({ id: 'b' });
    const c = makeCoalescer();
    c.upsertVehicle(mkVehicle({ id: 'z' }));
    c.removeVehicle('z');
    c.resetVehicles([a, b]);
    clock.advance(250);
    expect(deltaCalls).toHaveLength(1);
    expect(deltaCalls[0].vehicles.reset?.map((v) => v.id)).toEqual(['a', 'b']);
  });

  it('12. reset then upsert same window → reset snapshot includes upserted fields', () => {
    const c = makeCoalescer();
    c.resetVehicles([mkVehicle({ id: 'base', label: 'old' })]);
    c.upsertVehicle(mkVehicle({ id: 'base', label: 'new' }));
    clock.advance(250);
    const v = deltaCalls[0].vehicles.reset?.find((x) => x.id === 'base');
    expect(v?.label).toBe('new');
  });

  it('13. reset then remove in same window → reset snapshot excludes removed id', () => {
    const a = mkVehicle({ id: 'a' });
    const b = mkVehicle({ id: 'b' });
    const c = makeCoalescer();
    c.resetVehicles([a, b]);
    c.removeVehicle('a');
    clock.advance(250);
    const ids = new Set(deltaCalls[0].vehicles.reset?.map((v) => v.id));
    expect(ids).toEqual(new Set(['b']));
  });

  it('14. prediction LWW same id', () => {
    const c = makeCoalescer();
    c.upsertPrediction(mkPrediction({ id: 'p', arrivalTime: '2026-04-06T12:00:00-04:00' }));
    c.upsertPrediction(mkPrediction({ id: 'p', arrivalTime: '2026-04-06T13:00:00-04:00' }));
    clock.advance(250);
    expect(deltaCalls[0].predictions.updated).toHaveLength(1);
    expect(deltaCalls[0].predictions.updated?.[0]?.arrivalTime).toBe('2026-04-06T13:00:00-04:00');
  });

  it('15. resetPredictions+flush; removePrediction → removed contains id', () => {
    const p = mkPrediction({ id: 'p1' });
    const c = makeCoalescer();
    c.resetPredictions([p]);
    clock.advance(250);
    c.removePrediction('p1');
    expect(state.getSnapshot().predictions['place-pktrm']?.some((x) => x.id === 'p1')).toBe(false);
    clock.advance(250);
    expect(deltaCalls[1].predictions.removed).toEqual(['p1']);
  });

  it('16. alert LWW same id', () => {
    const c = makeCoalescer();
    c.upsertAlert(mkAlert({ id: 'a', header: 'one' }));
    c.upsertAlert(mkAlert({ id: 'a', header: 'two' }));
    clock.advance(250);
    expect(deltaCalls[0].alerts.updated).toHaveLength(1);
    expect(deltaCalls[0].alerts.updated?.[0]?.header).toBe('two');
  });

  it('17. upsertAlert, removeAlert, resetAlerts([x]) → alerts.reset wins', () => {
    const x = mkAlert({ id: 'x' });
    const c = makeCoalescer();
    c.upsertAlert(mkAlert({ id: 'y' }));
    c.removeAlert('y');
    c.resetAlerts([x]);
    clock.advance(250);
    expect(deltaCalls[0].alerts.reset?.map((a) => a.id)).toEqual(['x']);
  });

  it('18. Flood: 200 vehicles collapse to one delta with 200 updated', () => {
    const c = makeCoalescer();
    for (let i = 0; i < 200; i++) {
      c.upsertVehicle(mkVehicle({ id: `v${i}`, label: String(i) }));
    }
    expect(clock.scheduleCalls).toHaveLength(1);
    expect(state.getState().vehicles.size).toBe(200);
    clock.advance(250);
    expect(deltaCalls).toHaveLength(1);
    expect(deltaCalls[0].vehicles.updated).toHaveLength(200);
    const ids = new Set(deltaCalls[0].vehicles.updated?.map((v) => v.id));
    expect(ids.size).toBe(200);
  });

  it('19. upsert writes through to state before flush', () => {
    const v = mkVehicle({ id: 'w1' });
    const c = makeCoalescer();
    c.upsertVehicle(v);
    expect(state.getState().vehicles.get('w1')).toEqual(v);
    expect(deltaCalls).toHaveLength(0);
  });

  it('20. after reset+flush, remove writes through before second flush', () => {
    const v1 = mkVehicle({ id: 'r1' });
    const c = makeCoalescer();
    c.resetVehicles([v1]);
    clock.advance(250);
    c.removeVehicle('r1');
    expect(state.getState().vehicles.has('r1')).toBe(false);
    clock.advance(250);
    expect(deltaCalls[1].vehicles.removed).toEqual(['r1']);
  });

  it('21. close() clears timer, advance does not broadcast', () => {
    const c = makeCoalescer();
    c.upsertVehicle(mkVehicle({ id: 'z' }));
    expect(clock.pendingCount()).toBe(1);
    c.close();
    expect(clock.pendingCount()).toBe(0);
    clock.advance(10_000);
    expect(deltaCalls).toHaveLength(0);
  });
});
