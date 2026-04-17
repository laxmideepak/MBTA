import { beforeEach, describe, expect, it } from 'vitest';
import { useSystemStore } from '../../src/store/systemStore';
import type { Alert, Prediction, Vehicle, WsMessage } from '../../src/types';

function mkVehicle(overrides: Partial<Vehicle> & { id: string }): Vehicle {
  return {
    routeId: 'Red',
    latitude: 42.35,
    longitude: -71.06,
    bearing: 0,
    currentStatus: 'IN_TRANSIT_TO',
    stopId: 'place-jfk',
    currentStopSequence: 70,
    directionId: 1,
    label: overrides.id,
    tripId: `trip-${overrides.id}`,
    updatedAt: '2026-04-16T21:00:00Z',
    ...overrides,
  };
}

function mkPrediction(overrides: Partial<Prediction> & { id: string; stopId: string }): Prediction {
  return {
    routeId: 'Red',
    directionId: 1,
    arrivalTime: '2026-04-16T21:05:00Z',
    departureTime: null,
    status: null,
    tripId: `trip-${overrides.id}`,
    vehicleId: null,
    stopSequence: 70,
    ...overrides,
  };
}

function mkAlert(overrides: Partial<Alert> & { id: string }): Alert {
  return {
    effect: 'DELAY',
    cause: 'MECHANICAL_PROBLEM',
    header: 'Test alert',
    shortHeader: 'Test',
    serviceEffect: 'Test',
    timeframe: null,
    banner: null,
    description: 'Test description',
    severity: 5,
    lifecycle: 'ONGOING',
    url: null,
    activePeriod: [],
    informedEntities: [],
    createdAt: null,
    updatedAt: '2026-04-16T21:00:00Z',
    ...overrides,
  };
}

function resetStore(): void {
  useSystemStore.setState({
    vehicles: [],
    predictions: {},
    alerts: [],
    lastMessageTime: 0,
  });
}

describe('useSystemStore', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('vehicles', () => {
    it('upserts a new vehicle', () => {
      const store = useSystemStore.getState();
      store.upsertVehicle(mkVehicle({ id: 'v1' }));
      expect(useSystemStore.getState().vehicles).toHaveLength(1);
      expect(useSystemStore.getState().vehicles[0].id).toBe('v1');
    });

    it('replaces an existing vehicle by id (not duplicate)', () => {
      const store = useSystemStore.getState();
      store.upsertVehicle(mkVehicle({ id: 'v1', latitude: 42.35 }));
      store.upsertVehicle(mkVehicle({ id: 'v1', latitude: 42.4 }));
      const vehicles = useSystemStore.getState().vehicles;
      expect(vehicles).toHaveLength(1);
      expect(vehicles[0].latitude).toBe(42.4);
    });

    it('removes a vehicle by id', () => {
      const store = useSystemStore.getState();
      store.upsertVehicle(mkVehicle({ id: 'v1' }));
      store.upsertVehicle(mkVehicle({ id: 'v2' }));
      store.removeVehicle('v1');
      const vehicles = useSystemStore.getState().vehicles;
      expect(vehicles).toHaveLength(1);
      expect(vehicles[0].id).toBe('v2');
    });

    it('resets the whole vehicle list', () => {
      const store = useSystemStore.getState();
      store.upsertVehicle(mkVehicle({ id: 'v1' }));
      store.resetVehicles([mkVehicle({ id: 'v2' }), mkVehicle({ id: 'v3' })]);
      expect(useSystemStore.getState().vehicles.map((v) => v.id)).toEqual(['v2', 'v3']);
    });
  });

  describe('predictions', () => {
    it('upserts predictions indexed by stopId', () => {
      const store = useSystemStore.getState();
      store.upsertPrediction(mkPrediction({ id: 'p1', stopId: 'place-jfk' }));
      store.upsertPrediction(mkPrediction({ id: 'p2', stopId: 'place-jfk' }));
      store.upsertPrediction(mkPrediction({ id: 'p3', stopId: 'place-pktrm' }));
      const predictions = useSystemStore.getState().predictions;
      expect(predictions['place-jfk']).toHaveLength(2);
      expect(predictions['place-pktrm']).toHaveLength(1);
    });

    it('replaces a prediction when upserting with an existing id', () => {
      const store = useSystemStore.getState();
      store.upsertPrediction(
        mkPrediction({ id: 'p1', stopId: 'place-jfk', status: 'Approaching' }),
      );
      store.upsertPrediction(mkPrediction({ id: 'p1', stopId: 'place-jfk', status: 'Boarding' }));
      const preds = useSystemStore.getState().predictions['place-jfk'];
      expect(preds).toHaveLength(1);
      expect(preds[0].status).toBe('Boarding');
    });

    it('removes a prediction by id across all stops', () => {
      const store = useSystemStore.getState();
      store.upsertPrediction(mkPrediction({ id: 'p1', stopId: 'place-jfk' }));
      store.upsertPrediction(mkPrediction({ id: 'p2', stopId: 'place-jfk' }));
      store.upsertPrediction(mkPrediction({ id: 'p3', stopId: 'place-pktrm' }));
      store.removePredictionById('p2');
      const preds = useSystemStore.getState().predictions;
      expect(preds['place-jfk'].map((p) => p.id)).toEqual(['p1']);
      expect(preds['place-pktrm'].map((p) => p.id)).toEqual(['p3']);
    });
  });

  describe('alerts', () => {
    it('upserts/replaces/removes alerts by id', () => {
      const store = useSystemStore.getState();
      store.upsertAlert(mkAlert({ id: 'a1', header: 'first' }));
      store.upsertAlert(mkAlert({ id: 'a1', header: 'updated' }));
      expect(useSystemStore.getState().alerts).toHaveLength(1);
      expect(useSystemStore.getState().alerts[0].header).toBe('updated');
      store.removeAlert('a1');
      expect(useSystemStore.getState().alerts).toHaveLength(0);
    });
  });

  describe('handleWsMessage', () => {
    it('applies a full-state snapshot', () => {
      const msg: WsMessage = {
        type: 'full-state',
        timestamp: Date.now(),
        data: {
          vehicles: [mkVehicle({ id: 'v1' })],
          predictions: { 'place-jfk': [mkPrediction({ id: 'p1', stopId: 'place-jfk' })] },
          alerts: [mkAlert({ id: 'a1' })],
        },
      };
      useSystemStore.getState().handleWsMessage(msg);
      const s = useSystemStore.getState();
      expect(s.vehicles).toHaveLength(1);
      expect(s.predictions['place-jfk']).toHaveLength(1);
      expect(s.alerts).toHaveLength(1);
    });

    it('routes vehicles-update reset/upsert/remove', () => {
      const handle = useSystemStore.getState().handleWsMessage;
      handle({
        type: 'vehicles-update',
        timestamp: 0,
        data: { type: 'reset', vehicles: [mkVehicle({ id: 'v1' })] },
      });
      expect(useSystemStore.getState().vehicles.map((v) => v.id)).toEqual(['v1']);
      handle({
        type: 'vehicles-update',
        timestamp: 0,
        data: { type: 'upsert', vehicle: mkVehicle({ id: 'v2' }) },
      });
      expect(useSystemStore.getState().vehicles).toHaveLength(2);
      handle({
        type: 'vehicles-update',
        timestamp: 0,
        data: { type: 'remove', id: 'v1' },
      });
      expect(useSystemStore.getState().vehicles.map((v) => v.id)).toEqual(['v2']);
    });

    it('updates lastMessageTime on every valid message', () => {
      const before = useSystemStore.getState().lastMessageTime;
      useSystemStore.getState().handleWsMessage({
        type: 'alerts-update',
        timestamp: 0,
        data: { type: 'reset', alerts: [] },
      });
      expect(useSystemStore.getState().lastMessageTime).toBeGreaterThan(before);
    });

    it('drops malformed messages without throwing', () => {
      expect(() => {
        useSystemStore
          .getState()
          .handleWsMessage({ type: undefined as never, data: null, timestamp: 0 });
      }).not.toThrow();
    });
  });
});
