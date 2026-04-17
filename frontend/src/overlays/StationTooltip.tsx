import type { FC } from 'react';
import type { Stop } from '../types';
import { getRouteColorHex, getRouteDisplayName } from '../utils/mbta-colors';
import '../styles/tooltip.css';

interface StationTooltipProps {
  x: number;
  y: number;
  stop: Stop;
}

export const StationTooltip: FC<StationTooltipProps> = ({ x, y, stop }) => {
  const routeIds = stop.routeIds ?? [];

  return (
    <div className="station-tooltip" style={{ left: x + 12, top: y - 12 }}>
      <div className="tooltip-header">
        <span className="tooltip-line-name">{stop.name}</span>
      </div>

      {routeIds.length > 0 && (
        <div className="station-tooltip-lines">
          {routeIds.map((routeId) => (
            <span
              key={routeId}
              className="station-tooltip-line-chip"
              style={{ background: getRouteColorHex(routeId) }}
            >
              {getRouteDisplayName(routeId)}
            </span>
          ))}
        </div>
      )}

      <div className="station-tooltip-meta">Coordinates</div>
      <div className="station-tooltip-coord">
        <span>Lat</span> {stop.latitude.toFixed(6)}
      </div>
      <div className="station-tooltip-coord">
        <span>Lon</span> {stop.longitude.toFixed(6)}
      </div>
    </div>
  );
};
