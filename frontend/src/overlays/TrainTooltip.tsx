import { type FC } from 'react';
import { getRouteColorHex, getRouteDisplayName } from '../utils/mbta-colors';
import { formatMinutesUntil } from '../utils/time-format';
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

const DIRECTION_LABELS: Record<string, Record<number, string>> = {
  'Red': { 0: 'Ashmont/Braintree', 1: 'Alewife' },
  'Orange': { 0: 'Forest Hills', 1: 'Oak Grove' },
  'Blue': { 0: 'Bowdoin', 1: 'Wonderland' },
  'Green-B': { 0: 'Boston College', 1: 'Government Center' },
  'Green-C': { 0: 'Cleveland Circle', 1: 'Government Center' },
  'Green-D': { 0: 'Riverside', 1: 'Union Square' },
  'Green-E': { 0: 'Heath Street', 1: 'Medford/Tufts' },
  'Mattapan': { 0: 'Mattapan', 1: 'Ashmont' },
};

export const TrainTooltip: FC<TrainTooltipProps> = ({ x, y, routeId, directionId, stopId, predictions, progress }) => {
  const color = getRouteColorHex(routeId);
  const lineName = getRouteDisplayName(routeId);
  const direction = DIRECTION_LABELS[routeId]?.[directionId] ?? `Direction ${directionId}`;

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
              <span className="tooltip-stop-name">{pred.stopId.replace('place-', '')}</span>
              <span className="tooltip-stop-time">{formatMinutesUntil(pred.arrivalTime!)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
