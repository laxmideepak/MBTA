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

type VehiclesWire =
  | { type: 'reset'; vehicles: Vehicle[] }
  | { type: 'upsert'; vehicle: Vehicle }
  | { type: 'remove'; id: string };

type PredictionsWire =
  | { type: 'reset'; predictions: Record<string, Prediction[]> }
  | { type: 'upsert'; prediction: Prediction }
  | { type: 'remove'; id: string };

type AlertsWire =
  | { type: 'reset'; alerts: Alert[] }
  | { type: 'upsert'; alert: Alert }
  | { type: 'remove'; id: string };

describe('Coalescer', () => {
  let state: StateManager;
  let clock: FakeTimer;
  let vehicleCalls: VehiclesWire[];
  let predictionCalls: PredictionsWire[];
  let alertCalls: AlertsWire[];

  beforeEach(() => {
    state = new StateManager();
    clock = new FakeTimer();
    vehicleCalls = [];
    predictionCalls = [];
    alertCalls = [];
  });

  function makeCoalescer(): Coalescer {
    return new Coalescer(
      state,
      {
        broadcastVehicles: vi.fn((data: unknown) => {
          vehicleCalls.push(data as VehiclesWire);
        }),
        broadcastPredictions: vi.fn((data: unknown) => {
          predictionCalls.push(data as PredictionsWire);
        }),
        broadcastAlerts: vi.fn((data: unknown) => {
          alertCalls.push(data as AlertsWire);
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
    expect(vehicleCalls).toHaveLength(0);
  });

  it('2. after advance(250), one broadcastVehicles upsert', () => {
    const c = makeCoalescer();
    c.upsertVehicle(mkVehicle({ id: 'v1' }));
    clock.advance(250);
    expect(vehicleCalls).toHaveLength(1);
    expect(vehicleCalls[0]).toEqual({ type: 'upsert', vehicle: mkVehicle({ id: 'v1' }) });
  });

  it('3. 50 sync upserts: setTimeoutFn called once; after advance(250), broadcastVehicles called 50 times all upsert', () => {
    const c = makeCoalescer();
    for (let i = 0; i < 50; i++) {
      c.upsertVehicle(mkVehicle({ id: `v${i}`, label: String(i) }));
    }
    expect(clock.scheduleCalls).toHaveLength(1);
    clock.advance(250);
    expect(vehicleCalls).toHaveLength(50);
    for (const msg of vehicleCalls) {
      expect(msg.type).toBe('upsert');
    }
  });

  it('4. upsert vehicle+prediction+alert sync: advance(250) → each broadcast* called once', () => {
    const c = makeCoalescer();
    c.upsertVehicle(mkVehicle({ id: 'v1' }));
    c.upsertPrediction(mkPrediction({ id: 'p1' }));
    c.upsertAlert(mkAlert({ id: 'a1' }));
    clock.advance(250);
    expect(vehicleCalls).toHaveLength(1);
    expect(predictionCalls).toHaveLength(1);
    expect(alertCalls).toHaveLength(1);
  });

  it('5. two flushes: second scheduled delay is 240', () => {
    const c = makeCoalescer();
    c.upsertVehicle(mkVehicle({ id: 'v1' }));
    clock.advance(250);
    clock.advance(10);
    c.upsertVehicle(mkVehicle({ id: 'v2' }));
    expect(clock.scheduleCalls[1]).toBe(240);
    clock.advance(240);
    expect(vehicleCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('6. manual flush() after scheduling: broadcaster called, no pending timers', () => {
    const c = makeCoalescer();
    c.upsertVehicle(mkVehicle({ id: 'v1' }));
    c.flush();
    expect(vehicleCalls).toHaveLength(1);
    expect(clock.pendingCount()).toBe(0);
  });

  it('7. flush() on fresh coalescer: no broadcast', () => {
    const c = makeCoalescer();
    c.flush();
    expect(vehicleCalls).toHaveLength(0);
    expect(predictionCalls).toHaveLength(0);
    expect(alertCalls).toHaveLength(0);
  });

  it('8. vehicle LWW: three upserts same id different label → one upsert with last label', () => {
    const c = makeCoalescer();
    c.upsertVehicle(mkVehicle({ id: 'same', label: 'a' }));
    c.upsertVehicle(mkVehicle({ id: 'same', label: 'b' }));
    c.upsertVehicle(mkVehicle({ id: 'same', label: 'c' }));
    clock.advance(250);
    expect(vehicleCalls).toHaveLength(1);
    expect(vehicleCalls[0].type).toBe('upsert');
    if (vehicleCalls[0].type === 'upsert') {
      expect(vehicleCalls[0].vehicle.label).toBe('c');
    }
  });

  it('9. upsert then remove same id → only one remove broadcast', () => {
    const c = makeCoalescer();
    c.upsertVehicle(mkVehicle({ id: 'x' }));
    c.removeVehicle('x');
    clock.advance(250);
    expect(vehicleCalls).toHaveLength(1);
    expect(vehicleCalls[0]).toEqual({ type: 'remove', id: 'x' });
  });

  it('10. resetVehicles [v1], flush; remove v1 then upsert v1 → second flush only upsert', () => {
    const v1 = mkVehicle({ id: 'v1' });
    const c = makeCoalescer();
    c.resetVehicles([v1]);
    clock.advance(250);
    c.removeVehicle('v1');
    c.upsertVehicle(v1);
    clock.advance(250);
    const upserts = vehicleCalls.filter((m) => m.type === 'upsert');
    const removes = vehicleCalls.filter((m) => m.type === 'remove');
    expect(upserts).toHaveLength(1);
    expect(removes).toHaveLength(0);
  });

  it('11. upsert+remove+resetVehicles([a,b]) before flush → only reset, no upsert/remove', () => {
    const a = mkVehicle({ id: 'a' });
    const b = mkVehicle({ id: 'b' });
    const c = makeCoalescer();
    c.upsertVehicle(mkVehicle({ id: 'z' }));
    c.removeVehicle('z');
    c.resetVehicles([a, b]);
    clock.advance(250);
    expect(vehicleCalls).toHaveLength(1);
    expect(vehicleCalls[0].type).toBe('reset');
    if (vehicleCalls[0].type === 'reset') {
      expect(vehicleCalls[0].vehicles).toHaveLength(2);
    }
  });

  it('12. reset then upsert same window → reset snapshot includes upserted fields', () => {
    const c = makeCoalescer();
    c.resetVehicles([mkVehicle({ id: 'base', label: 'old' })]);
    c.upsertVehicle(mkVehicle({ id: 'base', label: 'new' }));
    clock.advance(250);
    expect(vehicleCalls).toHaveLength(1);
    expect(vehicleCalls[0].type).toBe('reset');
    if (vehicleCalls[0].type === 'reset') {
      const v = vehicleCalls[0].vehicles.find((x) => x.id === 'base');
      expect(v?.label).toBe('new');
    }
  });

  it('13. reset then remove in same window → reset snapshot excludes removed id', () => {
    const a = mkVehicle({ id: 'a' });
    const b = mkVehicle({ id: 'b' });
    const c = makeCoalescer();
    c.resetVehicles([a, b]);
    c.removeVehicle('a');
    clock.advance(250);
    expect(vehicleCalls[0].type).toBe('reset');
    if (vehicleCalls[0].type === 'reset') {
      const ids = new Set(vehicleCalls[0].vehicles.map((v) => v.id));
      expect(ids).toEqual(new Set(['b']));
    }
  });

  it('14. prediction LWW same id', () => {
    const c = makeCoalescer();
    c.upsertPrediction(mkPrediction({ id: 'p', arrivalTime: '2026-04-06T12:00:00-04:00' }));
    c.upsertPrediction(mkPrediction({ id: 'p', arrivalTime: '2026-04-06T13:00:00-04:00' }));
    clock.advance(250);
    expect(predictionCalls).toHaveLength(1);
    expect(predictionCalls[0].type).toBe('upsert');
    if (predictionCalls[0].type === 'upsert') {
      expect(predictionCalls[0].prediction.arrivalTime).toBe('2026-04-06T13:00:00-04:00');
    }
  });

  it('15. resetPredictions+flush; removePrediction → remove broadcast; state has no prediction', () => {
    const p = mkPrediction({ id: 'p1' });
    const c = makeCoalescer();
    c.resetPredictions([p]);
    clock.advance(250);
    c.removePrediction('p1');
    clock.advance(250);
    const last = predictionCalls[predictionCalls.length - 1];
    expect(last.type).toBe('remove');
    if (last.type === 'remove') {
      expect(last.id).toBe('p1');
    }
    expect(state.getState().predictions.get('place-pktrm') ?? []).toHaveLength(0);
  });

  it('16. alert LWW same id', () => {
    const c = makeCoalescer();
    c.upsertAlert(mkAlert({ id: 'a', header: 'one' }));
    c.upsertAlert(mkAlert({ id: 'a', header: 'two' }));
    clock.advance(250);
    expect(alertCalls).toHaveLength(1);
    expect(alertCalls[0].type).toBe('upsert');
    if (alertCalls[0].type === 'upsert') {
      expect(alertCalls[0].alert.header).toBe('two');
    }
  });

  it('17. upsertAlert, removeAlert, resetAlerts([x]) → only reset broadcast', () => {
    const x = mkAlert({ id: 'x' });
    const c = makeCoalescer();
    c.upsertAlert(mkAlert({ id: 'y' }));
    c.removeAlert('y');
    c.resetAlerts([x]);
    clock.advance(250);
    expect(alertCalls).toHaveLength(1);
    expect(alertCalls[0].type).toBe('reset');
    if (alertCalls[0].type === 'reset') {
      expect(alertCalls[0].alerts.map((a) => a.id)).toEqual(['x']);
    }
  });

  it('18. Flood: 200 vehicles: setTimeout once; state200 before advance; 200 upsert broadcasts; 200 unique ids', () => {
    const c = makeCoalescer();
    for (let i = 0; i < 200; i++) {
      c.upsertVehicle(mkVehicle({ id: `v${i}`, label: String(i) }));
    }
    expect(clock.scheduleCalls).toHaveLength(1);
    expect(state.getState().vehicles.size).toBe(200);
    clock.advance(250);
    expect(vehicleCalls).toHaveLength(200);
    const ids = new Set<string>();
    for (const msg of vehicleCalls) {
      expect(msg.type).toBe('upsert');
      if (msg.type === 'upsert') ids.add(msg.vehicle.id);
    }
    expect(ids.size).toBe(200);
  });

  it('19. upsert writes through to state before flush', () => {
    const v = mkVehicle({ id: 'w1' });
    const c = makeCoalescer();
    c.upsertVehicle(v);
    expect(state.getState().vehicles.get('w1')).toEqual(v);
    expect(vehicleCalls).toHaveLength(0);
  });

  it('20. after reset+flush, remove writes through before second flush', () => {
    const v1 = mkVehicle({ id: 'r1' });
    const c = makeCoalescer();
    c.resetVehicles([v1]);
    clock.advance(250);
    c.removeVehicle('r1');
    expect(state.getState().vehicles.has('r1')).toBe(false);
    clock.advance(250);
    expect(vehicleCalls.some((m) => m.type === 'remove' && m.id === 'r1')).toBe(true);
  });

  it('21. close() clears timer, advance does not broadcast', () => {
    const c = makeCoalescer();
    c.upsertVehicle(mkVehicle({ id: 'z' }));
    expect(clock.pendingCount()).toBe(1);
    c.close();
    expect(clock.pendingCount()).toBe(0);
    clock.advance(10_000);
    expect(vehicleCalls).toHaveLength(0);
  });
});
