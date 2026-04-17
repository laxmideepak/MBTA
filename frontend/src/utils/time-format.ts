// MBTA Real-Time Display Guidelines (PRD §11.2):
//   < 30s  -> "Boarding"
//   30-90s -> "Arriving"
//   > 90s  -> "X min"
export function formatStatus(
  arrivalTime: string | null,
  status: string | null,
  now: Date = new Date(),
): string {
  if (status && status !== 'On Time') return status;
  if (!arrivalTime) return '';
  const diffMs = new Date(arrivalTime).getTime() - now.getTime();
  if (diffMs < -30_000) return 'Departed';
  if (diffMs < 30_000) return 'Boarding';
  if (diffMs < 90_000) return 'Arriving';
  return `${Math.round(diffMs / 60_000)} min`;
}

/**
 * Format a clock time for *Boston-local* display. We always render MBTA
 * times in the agency's native timezone so "7:02" on the tooltip matches
 * what a rider would see on the station clock, regardless of where the
 * viewer happens to be.
 *
 * 12-hour numeric form without AM/PM to keep the parenthetical compact
 * ("3 min (7:02)" vs "3 min (7:02 PM)" which wraps awkwardly on narrow
 * tooltips). Riders already know whether it's morning or evening.
 */
export function formatClockTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    hour12: true,
  })
    .format(new Date(iso))
    .replace(/\s?(AM|PM)/i, '');
}

/**
 * Like formatStatus() but additionally returns the arrival's wall-clock
 * time so callers can render both parts. Example: a rider at 7:00 sees
 * "3 min (7:03)" — getting both the "how long" and the "when" without
 * mental math. Exposed as two fields so the UI can style the clock
 * muted/smaller than the primary countdown.
 *
 * `clock` is null for:
 *   - status-only rows (no arrival ETA), and
 *   - Departed (past) rows — there's nothing meaningful to show.
 */
export function formatStatusParts(
  arrivalTime: string | null,
  status: string | null,
  now: Date = new Date(),
): { label: string; clock: string | null } {
  const label = formatStatus(arrivalTime, status, now);
  if (!arrivalTime) return { label, clock: null };
  const diffMs = new Date(arrivalTime).getTime() - now.getTime();
  if (diffMs < -30_000) return { label, clock: null };
  return { label, clock: formatClockTime(arrivalTime) };
}

/**
 * Single-string convenience wrapper over formatStatusParts — handy for
 * compact places (logs, aria labels, tests) where we just want a flat
 * "3 min (7:03)" rather than two separately-styled spans.
 */
export function formatStatusWithClock(
  arrivalTime: string | null,
  status: string | null,
  now: Date = new Date(),
): string {
  const { label, clock } = formatStatusParts(arrivalTime, status, now);
  return clock ? `${label} (${clock})` : label;
}

export function minutesUntil(iso: string, now: Date = new Date()): number {
  return Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
}

// Backward-compat shim used by older callers.
export function formatMinutesUntil(isoTime: string, now: Date = new Date()): string {
  const target = new Date(isoTime);
  const diffMin = Math.floor((target.getTime() - now.getTime()) / 60_000);
  if (diffMin < 0) return 'Departed';
  if (diffMin < 1) return 'Arriving';
  return `${diffMin} min`;
}

/**
 * Format a scheduled (non-predicted) arrival. Within 60 min we show a short
 * countdown so it reads like live predictions; beyond that, a clock time so
 * the rider can plan ahead (matches mbta.com/schedules convention).
 */
export function formatScheduledStatus(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const diffMin = Math.round((d.getTime() - now.getTime()) / 60_000);
  if (diffMin <= 1) return '1 min';
  if (diffMin <= 60) return `${diffMin} min`;
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
