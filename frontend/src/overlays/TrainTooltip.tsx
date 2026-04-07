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
  predictions: Prediction[];
  progress: number;
}

export const TrainTooltip: FC<TrainTooltipProps> = ({ x, y, routeId, directionId, stopId, predictions, progress }) => {
  const color = getRouteColorHex(routeId);
  const lineName = getRouteDisplayName(routeId);
  const direction = DIRECTION_NAMES[routeId]?.[directionId] ?? `Direction ${directionId}`;

  const upcoming = predictions
    .filter((p) => p.directionId === directionId && p.arrivalTime)
    .sort((a, b) => new Date(a.arrivalTime!).getTime() - new Date(b.arrivalTime!).getTime())
    .slice(0, 3);

  return (
    <div className="train-tooltip" style={{ left: x + 12, top: y - 12 }}>
      <div className="tooltip-header">
        <div className="tooltip-color-dot" style={{ background: color }} />
        <span className="tooltip-line-name">{lineName}</span>
      </div>
      <div className="tooltip-direction">→ {direction}</div>
      <div className="tooltip-progress">
        <div className="tooltip-progress-bar" style={{ width: `${progress}%`, background: color }} />
      </div>
      <div className="tooltip-progress-text">{progress}%</div>
      {upcoming.length > 0 && (
        <div className="tooltip-stops">
          <div className="tooltip-stops-label">Next stops</div>
          {upcoming.map((pred) => (
            <div key={pred.id} className="tooltip-stop-row">
              <span className="tooltip-stop-name">{getStopName(pred.stopId)}</span>
              <span className="tooltip-stop-time">{formatMinutesUntil(pred.arrivalTime!)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
