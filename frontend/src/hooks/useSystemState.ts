import { useState, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import type { Vehicle, Prediction, Alert, FacilityWithStatus, Weather, WsMessage, SystemSnapshot } from '../types';

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

export function useSystemState() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction[]>>({});
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [facilities, setFacilities] = useState<FacilityWithStatus[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [lastMessageTime, setLastMessageTime] = useState(0);

  const handleMessage = useCallback((msg: WsMessage) => {
    setLastMessageTime(Date.now());
    if (!msg || typeof msg.type !== 'string') {
      console.warn('[WS] Dropping malformed message:', msg);
      return;
    }
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
            if (idx >= 0) { const next = [...prev]; next[idx] = data.vehicle; return next; }
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
        if (data.type === 'reset') setAlerts(data.alerts);
        else if (data.type === 'upsert') {
          setAlerts((prev) => {
            const idx = prev.findIndex((a) => a.id === data.alert.id);
            if (idx >= 0) { const next = [...prev]; next[idx] = data.alert; return next; }
            return [...prev, data.alert];
          });
        } else if (data.type === 'remove') setAlerts((prev) => prev.filter((a) => a.id !== data.id));
        break;
      }
      case 'facilities-update': { const data = msg.data as any; setFacilities(data.facilities); break; }
      case 'weather-update': { const data = msg.data as any; setWeather(data.weather); break; }
    }
  }, []);

  const { connected } = useWebSocket({ url: WS_URL, onMessage: handleMessage });
  return { vehicles, predictions, alerts, facilities, weather, connected };
}
