import { type FC, useState, useMemo } from 'react';
import type { Stop, Prediction } from '../types';

interface StationListProps {
  stops: Stop[];
  predictions: Record<string, Prediction[]>;
  onSelectStation: (stop: Stop) => void;
  visible: boolean;
  onClose: () => void;
}

export const StationList: FC<StationListProps> = ({ stops, predictions, onSelectStation, visible, onClose }) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const sorted = [...stops].sort((a, b) => a.name.localeCompare(b.name));
    if (!search) return sorted;
    const lower = search.toLowerCase();
    return sorted.filter((s) => s.name.toLowerCase().includes(lower));
  }, [stops, search]);

  if (!visible) return null;

  return (
    <div role="dialog" aria-label="Station list" style={{
      position: 'fixed', top: 48, left: 0, bottom: 0, width: 320,
      background: 'rgba(10, 10, 10, 0.95)', zIndex: 1000,
      borderRight: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#e0e0e0', fontWeight: 600, fontSize: 14 }}>Stations</span>
        <button onClick={onClose} aria-label="Close station list" style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>
      <input
        type="text" placeholder="Search stations..." value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search stations"
        style={{
          margin: '8px 16px', padding: '8px 12px', background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
          color: '#e0e0e0', fontSize: 13, outline: 'none',
        }}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }} role="listbox" aria-label="Station list">
        {filtered.map((stop) => {
          const preds = predictions[stop.id] ?? [];
          const next = preds.filter((p) => p.arrivalTime).sort((a, b) => new Date(a.arrivalTime!).getTime() - new Date(b.arrivalTime!).getTime())[0];
          const timeStr = next ? (() => {
            const mins = Math.round((new Date(next.arrivalTime!).getTime() - Date.now()) / 60000);
            return mins <= 0 ? 'Due' : `${mins} min`;
          })() : '';
          return (
            <button key={stop.id} role="option"
              onClick={() => onSelectStation(stop)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                width: '100%', padding: '10px 12px', margin: '2px 0',
                background: 'transparent', border: 'none', borderRadius: 4,
                color: '#e0e0e0', cursor: 'pointer', fontSize: 13, textAlign: 'left',
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
            >
              <span>{stop.name}</span>
              {timeStr && <span style={{ color: '#767676', fontSize: 12 }}>{timeStr}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};
