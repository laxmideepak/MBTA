import type { Alert, Prediction, SystemState, Vehicle } from './types.js';

export class StateManager {
  private state: SystemState = {
    vehicles: new Map(),
    predictions: new Map(),
    alerts: [],
  };

  getState(): SystemState {
    return {
      vehicles: new Map(this.state.vehicles),
      predictions: new Map(this.state.predictions),
      alerts: [...this.state.alerts],
    };
  }

  resetVehicles(vehicles: Vehicle[]): void {
    this.state.vehicles.clear();
    for (const v of vehicles) this.state.vehicles.set(v.id, v);
  }
  upsertVehicle(vehicle: Vehicle): void {
    this.state.vehicles.set(vehicle.id, vehicle);
  }
  removeVehicle(id: string): void {
    this.state.vehicles.delete(id);
  }

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
    if (idx >= 0) list[idx] = prediction;
    else list.push(prediction);
    this.state.predictions.set(prediction.stopId, list);
  }
  removePrediction(predictionId: string, stopId: string): void {
    const list = this.state.predictions.get(stopId);
    if (!list) return;
    this.state.predictions.set(
      stopId,
      list.filter((p) => p.id !== predictionId),
    );
  }
  removePredictionById(predictionId: string): void {
    for (const [stopId, list] of this.state.predictions) {
      const idx = list.findIndex((p) => p.id === predictionId);
      if (idx >= 0) {
        list.splice(idx, 1);
        this.state.predictions.set(stopId, list);
        return;
      }
    }
  }

  resetAlerts(alerts: Alert[]): void {
    this.state.alerts = alerts;
  }
  upsertAlert(alert: Alert): void {
    const idx = this.state.alerts.findIndex((a) => a.id === alert.id);
    if (idx >= 0) this.state.alerts[idx] = alert;
    else this.state.alerts.push(alert);
  }
  removeAlert(id: string): void {
    this.state.alerts = this.state.alerts.filter((a) => a.id !== id);
  }

  getSnapshot() {
    // Copy each inner array so callers (coalescer flush → WS broadcast) can't
    // observe torn state when a later upsert/remove mutates the underlying
    // list in place (see upsertPrediction / removePredictionById).
    const predictions: Record<string, Prediction[]> = {};
    for (const [stopId, preds] of this.state.predictions) predictions[stopId] = [...preds];
    return {
      vehicles: Array.from(this.state.vehicles.values()),
      predictions,
      alerts: [...this.state.alerts],
    };
  }
}
