import { type FC } from 'react';
import type { Stop } from '../types';
interface BoardHeaderProps { selectedStop: Stop | null; stops: Stop[]; onSelectStop: (stopId: string) => void; }
export const BoardHeader: FC<BoardHeaderProps> = ({ selectedStop, stops, onSelectStop }) => (
  <div>
    <div className="board-station-name">{selectedStop?.name ?? 'Select a station'}</div>
    <select className="board-station-selector" value={selectedStop?.id ?? ''} onChange={(e) => onSelectStop(e.target.value)}>
      <option value="">Choose station...</option>
      {stops.sort((a, b) => a.name.localeCompare(b.name)).map((stop) => (
        <option key={stop.id} value={stop.id}>{stop.name}</option>
      ))}
    </select>
  </div>
);
