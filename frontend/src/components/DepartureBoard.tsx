import { useState, useEffect, useMemo } from 'react';
import { BoardHeader } from '../board/BoardHeader';
import { BoardLine } from '../board/BoardLine';
import { BoardAlerts } from '../board/BoardAlerts';
import { useGeolocation } from '../hooks/useGeolocation';
import type { Prediction, Alert, FacilityWithStatus, Stop } from '../types';
import '../styles/board.css';

interface DepartureBoardProps { predictions: Record<string, Prediction[]>; alerts: Alert[]; facilities: FacilityWithStatus[]; }

export function DepartureBoard({ predictions, alerts, facilities }: DepartureBoardProps) {
  const [stops, setStops] = useState<Stop[]>([]);
  const [selectedStopId, setSelectedStopId] = useState<string>('');
  const geoPosition = useGeolocation();

  useEffect(() => {
    fetch('/api/stops').then((r) => r.json()).then((json) => {
      const parsed: Stop[] = json.data
        .filter((s: any) => s.attributes.location_type === 1 || s.attributes.location_type === 0)
        .map((s: any) => ({
          id: s.id, name: s.attributes.name, latitude: s.attributes.latitude,
          longitude: s.attributes.longitude, wheelchairBoarding: s.attributes.wheelchair_boarding ?? 0, routeIds: [],
        }));
      setStops(parsed);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!geoPosition || stops.length === 0 || selectedStopId) return;
    let nearest = stops[0]; let minDist = Infinity;
    for (const stop of stops) {
      const d = (stop.latitude - geoPosition.latitude) ** 2 + (stop.longitude - geoPosition.longitude) ** 2;
      if (d < minDist) { minDist = d; nearest = stop; }
    }
    setSelectedStopId(nearest.id);
  }, [geoPosition, stops, selectedStopId]);

  const selectedStop = stops.find((s) => s.id === selectedStopId) ?? null;
  const stopPredictions = predictions[selectedStopId] ?? [];
  const predsByRoute = useMemo(() => {
    const map = new Map<string, Prediction[]>();
    for (const pred of stopPredictions) { const list = map.get(pred.routeId) ?? []; list.push(pred); map.set(pred.routeId, list); }
    return map;
  }, [stopPredictions]);

  return (
    <div className="board">
      <div className="board-container">
        <BoardHeader selectedStop={selectedStop} stops={stops} onSelectStop={setSelectedStopId} />
        {Array.from(predsByRoute.entries()).map(([routeId, preds]) => (
          <BoardLine key={routeId} routeId={routeId} predictions={preds} />
        ))}
        {selectedStopId && <BoardAlerts alerts={alerts} facilities={facilities} stopId={selectedStopId} />}
      </div>
    </div>
  );
}
