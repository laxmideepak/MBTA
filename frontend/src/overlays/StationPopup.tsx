import { type FC } from 'react';
import { getRouteColorHex, getRouteDisplayName } from '../utils/mbta-colors';
import { DIRECTION_NAMES } from '../utils/mbta-routes';
import type { Prediction, Stop } from '../types';
import '../styles/tooltip.css';

interface StationPopupProps {
  stop: Stop;
  predictions: Prediction[];
  x: number;
  y: number;
  onClose: () => void;
}

export const StationPopup: FC<StationPopupProps> = ({ stop, predictions, x, y, onClose }) => {
  // Group by route
  const byRoute = new Map<string, Prediction[]>();
  for (const pred of predictions) {
    if (!pred.arrivalTime) continue;
    const list = byRoute.get(pred.routeId) ?? [];
    list.push(pred);
    byRoute.set(pred.routeId, list);
  }
  for (const [, preds] of byRoute) {
    preds.sort((a, b) => new Date(a.arrivalTime!).getTime() - new Date(b.arrivalTime!).getTime());
  }

  return (
    <div className="train-tooltip" style={{ left: x + 12, top: y - 12, pointerEvents: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span className="tooltip-line-name">{stop.name}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
      </div>
      {Array.from(byRoute.entries()).map(([routeId, preds]) => (
        <div key={routeId} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: getRouteColorHex(routeId), textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
            {getRouteDisplayName(routeId)}
          </div>
          {preds.slice(0, 3).map((pred) => {
            const dest = DIRECTION_NAMES[pred.routeId]?.[pred.directionId] ?? '';
            const diffMs = new Date(pred.arrivalTime!).getTime() - Date.now();
            const mins = Math.round(diffMs / 60000);
            const timeStr = mins <= 0 ? 'Due' : `${mins} min`;
            return (
              <div key={pred.id} className="tooltip-stop-row">
                <span className="tooltip-stop-name">{dest}</span>
                <span className="tooltip-stop-time">{timeStr}</span>
              </div>
            );
          })}
        </div>
      ))}
      {byRoute.size === 0 && (
        <div style={{ color: '#767676', fontSize: 12 }}>No upcoming departures</div>
      )}
    </div>
  );
};
