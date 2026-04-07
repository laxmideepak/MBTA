import { type FC } from 'react';
import '../styles/live-indicator.css';

interface LiveIndicatorProps { connected: boolean; }

export const LiveIndicator: FC<LiveIndicatorProps> = ({ connected }) => (
  <div className="live-indicator">
    <div className={`live-dot ${connected ? 'connected' : 'disconnected'}`} />
    <span className="live-text">LIVE</span>
  </div>
);
