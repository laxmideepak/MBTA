import { type FC } from 'react';
import { getRouteColorHex, getRouteDisplayName } from '../utils/mbta-colors';
import { formatMinutesUntil } from '../utils/time-format';
import type { Prediction } from '../types';

const DIRECTION_NAMES: Record<string, Record<number, string>> = {
  'Red': { 0: 'Ashmont/Braintree', 1: 'Alewife' }, 'Orange': { 0: 'Forest Hills', 1: 'Oak Grove' },
  'Blue': { 0: 'Bowdoin', 1: 'Wonderland' }, 'Green-B': { 0: 'Boston College', 1: 'Government Ctr' },
  'Green-C': { 0: 'Cleveland Circle', 1: 'Government Ctr' }, 'Green-D': { 0: 'Riverside', 1: 'Union Square' },
  'Green-E': { 0: 'Heath Street', 1: 'Medford/Tufts' }, 'Mattapan': { 0: 'Mattapan', 1: 'Ashmont' },
};

interface BoardLineProps { routeId: string; predictions: Prediction[]; }
export const BoardLine: FC<BoardLineProps> = ({ routeId, predictions }) => {
  const color = getRouteColorHex(routeId);
  const sorted = [...predictions].filter((p) => p.arrivalTime)
    .sort((a, b) => new Date(a.arrivalTime!).getTime() - new Date(b.arrivalTime!).getTime()).slice(0, 6);
  if (sorted.length === 0) return null;
  return (
    <div className="board-line-section">
      <div className="board-line-title" style={{ borderColor: color, color }}>{getRouteDisplayName(routeId)}</div>
      {sorted.map((pred) => {
        const destination = DIRECTION_NAMES[routeId]?.[pred.directionId] ?? '';
        const timeStr = formatMinutesUntil(pred.arrivalTime!);
        return (
          <div key={pred.id} className="board-row">
            <span className="board-destination">{destination}</span>
            <div><span className="board-time">{timeStr}</span>
              <span className={`board-status ${timeStr === 'Departed' ? 'delayed' : ''}`}>
                {timeStr === 'Departed' ? 'Delayed' : 'On time'}
              </span></div>
          </div>
        );
      })}
    </div>
  );
};
