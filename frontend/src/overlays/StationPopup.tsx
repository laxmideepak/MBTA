import { type FC } from 'react';
import { getRouteColorHex, getRouteDisplayName } from '../utils/mbta-colors';
import { formatMinutesUntil } from '../utils/time-format';
import type { Prediction, FacilityWithStatus, Stop } from '../types';

interface StationPopupProps {
  stop: Stop;
  predictions: Prediction[];
  facilities: FacilityWithStatus[];
  onClose: () => void;
}

export const StationPopup: FC<StationPopupProps> = ({ stop, predictions, facilities, onClose }) => {
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

  const stopFacilities = facilities.filter((f) => f.facility.stopId === stop.id);
  const brokenFacilities = stopFacilities.filter((f) => f.status?.status === 'OUT_OF_ORDER');
  const allWorking = brokenFacilities.length === 0;

  return (
    <div style={{
      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
      zIndex: 2000, minWidth: 280, padding: '16px 20px',
      background: 'rgba(20, 20, 20, 0.95)', borderRadius: 10,
      border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#e0e0e0' }}>{stop.name}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>
      {Array.from(byRoute.entries()).map(([routeId, preds]) => (
        <div key={routeId} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: getRouteColorHex(routeId), marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {getRouteDisplayName(routeId)}
          </div>
          {preds.slice(0, 4).map((pred) => (
            <div key={pred.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13 }}>
              <span style={{ color: '#aaa' }}>{pred.stopId.replace('place-', '')}</span>
              <span style={{ color: '#e0e0e0', fontWeight: 500 }}>{formatMinutesUntil(pred.arrivalTime!)}</span>
            </div>
          ))}
        </div>
      ))}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, marginTop: 4, fontSize: 12 }}>
        {allWorking ? (
          <span style={{ color: '#4CAF50' }}>All elevators/escalators working</span>
        ) : (
          brokenFacilities.map((f) => (
            <div key={f.facility.id} style={{ color: '#F44336', marginBottom: 2 }}>
              {f.facility.shortName} out of service
            </div>
          ))
        )}
      </div>
    </div>
  );
};
