import { useState, useEffect, useMemo, useCallback } from 'react';
import { getRouteColorHex, getRouteDisplayName } from '../utils/mbta-colors';
import { DIRECTION_NAMES } from '../utils/mbta-routes';
import { useGeolocation } from '../hooks/useGeolocation';
import type { Prediction, Alert, FacilityWithStatus, Stop } from '../types';
import '../styles/board.css';

function formatBoardTime(arrivalTime: string): string {
  const diffMs = new Date(arrivalTime).getTime() - Date.now();
  const mins = Math.round(diffMs / 60000);
  if (mins <= 0) return 'Due';
  if (mins === 1) return '1 min';
  return `${mins} mins`;
}

interface DepartureBoardProps {
  predictions: Record<string, Prediction[]>;
  alerts: Alert[];
  facilities: FacilityWithStatus[];
}

export function DepartureBoard({ predictions, alerts, facilities }: DepartureBoardProps) {
  const [stops, setStops] = useState<Stop[]>([]);
  const [selectedStopId, setSelectedStopId] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [, setTick] = useState(0);
  const geoPosition = useGeolocation();

  // Tick every second to update times
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

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

  // Auto-select nearest station
  useEffect(() => {
    if (!geoPosition || stops.length === 0 || selectedStopId) return;
    let nearest = stops[0]; let minDist = Infinity;
    for (const stop of stops) {
      const d = (stop.latitude - geoPosition.latitude) ** 2 + (stop.longitude - geoPosition.longitude) ** 2;
      if (d < minDist) { minDist = d; nearest = stop; }
    }
    selectStop(nearest.id);
  }, [geoPosition, stops]);

  const selectStop = useCallback((stopId: string) => {
    setSelectedStopId(stopId);
    const stop = stops.find((s) => s.id === stopId);
    if (stop) setSearchText(stop.name);
    setShowDropdown(false);
  }, [stops]);

  const filteredStops = useMemo(() => {
    if (searchText.length < 2) return [];
    const lower = searchText.toLowerCase();
    return stops
      .filter((s) => s.name.toLowerCase().includes(lower))
      .sort((a, b) => {
        const aStart = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
        const bStart = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
        return aStart - bStart || a.name.localeCompare(b.name);
      })
      .slice(0, 10);
  }, [searchText, stops]);

  const selectedStop = stops.find((s) => s.id === selectedStopId) ?? null;
  const stopPredictions = predictions[selectedStopId] ?? [];

  // Group by route
  const predsByRoute = useMemo(() => {
    const map = new Map<string, Prediction[]>();
    for (const pred of stopPredictions) {
      if (!pred.arrivalTime) continue;
      const list = map.get(pred.routeId) ?? [];
      list.push(pred);
      map.set(pred.routeId, list);
    }
    // Sort each route's predictions
    for (const [, preds] of map) {
      preds.sort((a, b) => new Date(a.arrivalTime!).getTime() - new Date(b.arrivalTime!).getTime());
    }
    return map;
  }, [stopPredictions]);

  // Relevant alerts
  const relevantAlerts = alerts.filter((a) =>
    a.informedEntities.some((e) => e.stopId === selectedStopId || !e.stopId)
  );
  const brokenFacilities = facilities.filter(
    (f) => f.facility.stopId === selectedStopId && f.status?.status === 'OUT_OF_ORDER'
  );

  return (
    <div className="board">
      <div className="board-container">
        {/* Search input */}
        <div className="board-search-wrapper">
          <input
            className="board-search"
            type="text"
            placeholder="Search for a station..."
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); setShowDropdown(true); }}
            onFocus={() => { if (searchText.length >= 2) setShowDropdown(true); }}
          />
          {showDropdown && filteredStops.length > 0 && (
            <div className="board-station-list">
              {filteredStops.map((stop) => (
                <div
                  key={stop.id}
                  className={`board-station-option ${stop.id === selectedStopId ? 'selected' : ''}`}
                  onClick={() => selectStop(stop.id)}
                >
                  {stop.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Station name */}
        {selectedStop && (
          <div className="board-station-name">{selectedStop.name}</div>
        )}

        {/* Departures by route */}
        {selectedStop && Array.from(predsByRoute.entries()).map(([routeId, preds]) => (
          <div key={routeId} className="board-platform">
            <div className="board-platform-header">
              <div className="board-platform-color" style={{ background: getRouteColorHex(routeId) }} />
              <span className="board-platform-name">{getRouteDisplayName(routeId)}</span>
              <span className="board-live-badge">LIVE</span>
            </div>
            {preds.slice(0, 5).map((pred, i) => {
              const timeStr = formatBoardTime(pred.arrivalTime!);
              const destination = DIRECTION_NAMES[routeId]?.[pred.directionId] ?? `Direction ${pred.directionId}`;
              return (
                <div key={pred.id} className="board-row">
                  <span className="board-row-num">{i + 1}</span>
                  <span className="board-row-dest">{destination}</span>
                  <span className={`board-row-time ${timeStr === 'Due' ? 'due' : ''}`}>{timeStr}</span>
                </div>
              );
            })}
            {preds.length === 0 && (
              <div className="board-empty">No trains scheduled</div>
            )}
          </div>
        ))}

        {selectedStop && predsByRoute.size === 0 && (
          <div className="board-empty">No departures available for this station</div>
        )}

        {/* Alerts */}
        {relevantAlerts.map((alert) => (
          <div key={alert.id} className="board-alert">{alert.header}</div>
        ))}
        {brokenFacilities.map((f) => (
          <div key={f.facility.id} className="board-facility-alert">{f.facility.shortName} out of service</div>
        ))}
      </div>
    </div>
  );
}
