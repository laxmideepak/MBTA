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
      id: 'y1234', routeId: 'Red', latitude: 42.3555, longitude: -71.0565,
      bearing: 180, currentStatus: 'IN_TRANSIT_TO', stopId: 'place-pktrm',
      directionId: 0, label: '1234', updatedAt: '2026-04-06T12:00:00-04:00',
    };
    const vehicle2: Vehicle = {
      id: 'y5678', routeId: 'Orange', latitude: 42.365, longitude: -71.062,
      bearing: 0, currentStatus: 'STOPPED_AT', stopId: 'place-dwnxg',
      directionId: 1, label: '5678', updatedAt: '2026-04-06T12:01:00-04:00',
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
      id: 'pred-1', routeId: 'Red', stopId: 'place-pktrm', directionId: 0,
      arrivalTime: '2026-04-06T12:10:00-04:00', departureTime: '2026-04-06T12:10:30-04:00',
      status: null, tripId: 'trip-100', vehicleId: 'y1234', stopSequence: 5,
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

    it('removePredictionById removes without knowing the stop', () => {
      manager.resetPredictions([pred]);
      manager.removePredictionById('pred-1');
      expect(manager.getState().predictions.get('place-pktrm')).toHaveLength(0);
    });

    it('removePredictionById is a no-op for unknown id', () => {
      manager.resetPredictions([pred]);
      manager.removePredictionById('does-not-exist');
      expect(manager.getState().predictions.get('place-pktrm')).toHaveLength(1);
    });
  });

  describe('alerts', () => {
    const alert: Alert = {
      id: 'alert-1', effect: 'SHUTTLE', cause: 'MAINTENANCE',
      header: 'Test alert', description: 'Test description',
      severity: 7, lifecycle: 'ONGOING',
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
        id: 'v1', routeId: 'Blue', latitude: 42.36, longitude: -71.05,
        bearing: 90, currentStatus: 'STOPPED_AT', stopId: 'place-state',
        directionId: 0, label: 'v1', updatedAt: '2026-04-06T12:00:00-04:00',
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
