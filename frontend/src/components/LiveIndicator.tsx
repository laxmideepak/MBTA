import { type FC } from 'react';

interface LiveIndicatorProps { connected: boolean; }

export const LiveIndicator: FC<LiveIndicatorProps> = ({ connected }) => (
  <>
    <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: connected ? '#4CAF50' : '#F44336',
        animation: connected ? 'pulse 2s ease-in-out infinite' : 'none',
      }} />
      <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '1.5px', color: '#e0e0e0' }}>LIVE</span>
    </div>
  </>
);
