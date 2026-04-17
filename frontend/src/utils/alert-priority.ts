/**
 * Alert classification + ranking.
 *
 * Distilled from the MBTA-realtime v2 README
 * (https://github.com/MassBigData/LateNightT …/MBTA-realtime API README.md)
 * whose lifecycle / banner / service_effect / timeframe concepts are still
 * the curated hints MBTA exposes through the V3 API.
 *
 *   banner present        → ALWAYS show (MBTA explicitly promoted it)
 *   severity ≥ 7          → show
 *   effect ∈ SHUTTLE/DELAY/SUSPENSION/STATION_CLOSURE → show
 *   lifecycle ∈ NEW/ONGOING/ONGOING_UPCOMING → show
 *   lifecycle UPCOMING within next 24h → show
 *   otherwise             → drop
 *
 * Ranking (lower number = more prominent):
 *   0 banner present
 *   1 severity ≥ 9 (SEVERE)
 *   2 lifecycle NEW + severity ≥ 7
 *   3 severity ≥ 7 ONGOING
 *   4 high-impact effect (SHUTTLE/SUSPENSION/STATION_CLOSURE) ONGOING
 *   5 other ongoing
 *   6 upcoming (within 24h)
 */

import type { Alert, AlertLifecycle } from '../types';

const HIGH_IMPACT_EFFECTS = new Set([
  'SHUTTLE',
  'SUSPENSION',
  'SERVICE_CHANGE',
  'STATION_CLOSURE',
  'DETOUR',
  'DELAY',
]);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface AlertVisibility {
  /** Is the alert currently worth showing to the user? */
  visible: boolean;
  /** 0 = top, higher = less prominent. Undefined when not visible. */
  rank?: number;
  /** Human lifecycle chip label, e.g. "NEW" / "ONGOING" / "UPCOMING". */
  chip?: string;
  /**
   * True when this alert should color its route's trains amber as a delay
   * cue (matches the old useTrainTrips semantics, expanded to match what
   * riders actually perceive as disruption).
   */
  delaysService: boolean;
}

function isActiveNow(alert: Alert, nowMs: number): boolean {
  const periods = alert.activePeriod ?? [];
  if (periods.length === 0) {
    // Per old v2 doc: ONGOING means active now even if period bounds missing.
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

function lifecycleChip(lc: AlertLifecycle): string | undefined {
  switch (lc) {
    case 'NEW':
      return 'NEW';
    case 'ONGOING':
      return 'ONGOING';
    case 'UPCOMING':
      return 'UPCOMING';
    case 'ONGOING_UPCOMING':
      return 'ONGOING';
    default:
      return undefined;
  }
}

export function classifyAlert(alert: Alert, nowMs = Date.now()): AlertVisibility {
  if (alert.lifecycle === 'CLOSED') {
    return { visible: false, delaysService: false };
  }

  const active = isActiveNow(alert, nowMs);
  const upcomingSoon = startsSoon(alert, nowMs, ONE_DAY_MS);
  const hasBanner = !!alert.banner;
  const highImpact = HIGH_IMPACT_EFFECTS.has(alert.effect);
  const severe = alert.severity >= 9;
  const major = alert.severity >= 7;

  if (!active && !upcomingSoon && !hasBanner) {
    return { visible: false, delaysService: false };
  }

  let rank = 5;
  if (hasBanner) rank = 0;
  else if (severe) rank = 1;
  else if (major && alert.lifecycle === 'NEW') rank = 2;
  else if (major && active) rank = 3;
  else if (highImpact && active) rank = 4;
  else if (!active && upcomingSoon) rank = 6;

  // If nothing above matched (no banner, mild severity, not high-impact, not
  // active-now, not upcoming-soon) we already returned. So rank is always set.

  const chip = lifecycleChip(alert.lifecycle);
  const delaysService = active && (major || highImpact || hasBanner);

  return { visible: true, rank, chip, delaysService };
}

/** Filter + sort alerts by display priority. */
export function rankAlerts(alerts: Alert[], nowMs = Date.now()): Alert[] {
  const scored = alerts
    .map((a) => ({ alert: a, vis: classifyAlert(a, nowMs) }))
    .filter((x) => x.vis.visible);
  scored.sort((a, b) => (a.vis.rank ?? 99) - (b.vis.rank ?? 99));
  return scored.map((x) => x.alert);
}

/**
 * Which route IDs currently have service-disrupting alerts?
 * Used by the map to color affected trains amber.
 */
export function delayedRouteIds(alerts: Alert[], nowMs = Date.now()): Set<string> {
  const out = new Set<string>();
  for (const alert of alerts) {
    const vis = classifyAlert(alert, nowMs);
    if (!vis.delaysService) continue;
    for (const e of alert.informedEntities) {
      if (e.routeId) out.add(e.routeId);
    }
  }
  return out;
}
