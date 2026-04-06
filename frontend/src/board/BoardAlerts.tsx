import { type FC } from 'react';
import type { Alert, FacilityWithStatus } from '../types';
interface BoardAlertsProps { alerts: Alert[]; facilities: FacilityWithStatus[]; stopId: string; }
export const BoardAlerts: FC<BoardAlertsProps> = ({ alerts, facilities, stopId }) => {
  const relevantAlerts = alerts.filter((a) => a.informedEntities.some((e) => e.stopId === stopId || !e.stopId));
  const brokenFacilities = facilities.filter((f) => f.facility.stopId === stopId && f.status?.status === 'OUT_OF_ORDER');
  if (relevantAlerts.length === 0 && brokenFacilities.length === 0) return null;
  return (
    <div>
      {relevantAlerts.map((alert) => (<div key={alert.id} className="board-alert">{alert.header}</div>))}
      {brokenFacilities.map((f) => (<div key={f.facility.id} className="board-facility-alert">{f.facility.shortName} out of service</div>))}
    </div>
  );
};
