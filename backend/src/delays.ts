import type { Alert } from './types.js';

const HIGH_IMPACT_EFFECTS = new Set([
  'SHUTTLE',
  'SUSPENSION',
  'SERVICE_CHANGE',
  'STATION_CLOSURE',
  'DETOUR',
  'DELAY',
]);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function isActiveNow(alert: Alert, nowMs: number): boolean {
  const periods = alert.activePeriod ?? [];
  if (periods.length === 0) {
    return alert.lifecycle === 'ONGOING' || alert.lifecycle === 'ONGOING_UPCOMING';
  }
  return periods.some((p) => {
    const start = p.start ? new Date(p.start).getTime() : 0;
    const end = p.end ? new Date(p.end).getTime() : Number.POSITIVE_INFINITY;
    return nowMs >= start && nowMs <= end;
  });
}

function startsSoon(alert: Alert, nowMs: number, windowMs: number): boolean {
  return (alert.activePeriod ?? []).some((p) => {
    if (!p.start) return false;
    const start = new Date(p.start).getTime();
    return start > nowMs && start - nowMs <= windowMs;
  });
}

export function delayedRouteIds(alerts: Alert[], nowMs: number): Set<string> {
  const out = new Set<string>();
  for (const alert of alerts) {
    if (alert.lifecycle === 'CLOSED') continue;

    const active = isActiveNow(alert, nowMs);
    const upcomingSoon = startsSoon(alert, nowMs, ONE_DAY_MS);
    const hasBanner = !!alert.banner;
    const highImpact = HIGH_IMPACT_EFFECTS.has(alert.effect);
    const major = alert.severity >= 7;

    const delaysService = active && (major || highImpact || hasBanner);
    if (!delaysService && !upcomingSoon) continue;

    for (const e of alert.informedEntities) {
      if (e.routeId) out.add(e.routeId);
    }
  }
  return out;
}
