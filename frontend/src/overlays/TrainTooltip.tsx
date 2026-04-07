import { type FC } from 'react';
import { getRouteColorHex, getRouteDisplayName } from '../utils/mbta-colors';
import { DIRECTION_NAMES } from '../utils/mbta-routes';
import { formatMinutesUntil } from '../utils/time-format';
import { getStopName } from '../utils/stop-names';
import type { Prediction } from '../types';
import '../styles/tooltip.css';

interface TrainTooltipProps {
  x: number;
  y: number;
  routeId: string;
  directionId: number;
  stopId: string;
  label?: string;
  currentStatus?: string;
  predictions: Prediction[];
  progress: number;
}

export const TrainTooltip: FC<TrainTooltipProps> = ({
  x, y, routeId, directionId, stopId, label, currentStatus, predictions, progress,
}) => {
  const color = getRouteColorHex(routeId);
  const lineName = getRouteDisplayName(routeId);
  const direction = DIRECTION_NAMES[routeId]?.[directionId] ?? `Direction ${directionId}`;
  const stationName = getStopName(stopId);
  const isStopped = currentStatus === 'STOPPED_AT';

  const upcoming = predictions
    .filter((p) => p.directionId === directionId && p.arrivalTime)
    .sort((a, b) => new Date(a.arrivalTime!).getTime() - new Date(b.arrivalTime!).getTime())
    .slice(0, 5);

  return (
    <div className="train-tooltip" style={{ left: x + 12, top: y - 12 }}>
      {/* Header: line color + name + train ID */}
      <div className="tooltip-header">
        <div className="tooltip-color-dot" style={{ background: color }} />
        <span className="tooltip-line-name" style={{ color }}>
          {lineName} {label ? `Train ${label}` : ''}
        </span>
      </div>

      {/* Status: STOPPED at X or From→To */}
      {isStopped ? (
        <div style={{ fontWeight: 600, fontSize: 12, color: '#e0e0e0', margin: '6px 0' }}>
          STOPPED at {stationName}
        </div>
      ) : (
        <div className="tooltip-direction">→ {direction}</div>
      )}

      {/* Progress bar */}
      <div className="tooltip-progress">
        <div className="tooltip-progress-bar" style={{ width: `${progress}%`, background: color }} />
      </div>
      <div className="tooltip-progress-text">{progress}%</div>

      {/* Future stops */}
      {upcoming.length > 0 && (
        <div className="tooltip-stops">
          <div className="tooltip-stops-label">Future Stops</div>
          {upcoming.map((pred) => {
            const arrivalDate = new Date(pred.arrivalTime!);
            const timeStr = arrivalDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            return (
              <div key={pred.id} className="tooltip-stop-row">
                <span className="tooltip-stop-time" style={{ minWidth: 70 }}>{timeStr}</span>
                <span className="tooltip-stop-name">{getStopName(pred.stopId)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
