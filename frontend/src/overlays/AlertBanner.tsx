import { type FC } from 'react';
import type { Alert } from '../types';

interface AlertBannerProps { alerts: Alert[]; }

export const AlertBanner: FC<AlertBannerProps> = ({ alerts }) => {
  const critical = alerts.filter((a) => a.severity >= 5 && a.lifecycle === 'ONGOING');
  if (critical.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', top: 52, left: 0, right: 0, zIndex: 999,
      padding: '8px 20px', background: 'rgba(255, 152, 0, 0.15)',
      borderBottom: '1px solid rgba(255, 152, 0, 0.3)', backdropFilter: 'blur(10px)',
    }}>
      {critical.map((alert) => (
        <div key={alert.id} style={{ fontSize: 13, color: '#FF9800', padding: '2px 0' }}>
          {alert.header}
        </div>
      ))}
    </div>
  );
};
