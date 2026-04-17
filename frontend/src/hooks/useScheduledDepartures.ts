import { useEffect, useMemo, useState } from 'react';
import type { ScheduledDeparture } from '../types';

/**
 * Fetches MBTA-published schedules for the given stop IDs and keeps them
 * fresh. The backend proxies to MBTA V3 `/schedules` with a 60s cache, so
 * we refresh at the same cadence — schedules are day-of, they don't churn.
 *
 * Returns an empty list when stopIds is empty (e.g. no station selected).
 */
export function useScheduledDepartures(stopIds: string[]): ScheduledDeparture[] {
  const key = useMemo(() => Array.from(new Set(stopIds)).sort().join(','), [stopIds]);
  const [schedules, setSchedules] = useState<ScheduledDeparture[]>([]);

  useEffect(() => {
    if (!key) {
      setSchedules([]);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/schedules?stop=${encodeURIComponent(key)}`, {
          signal: controller.signal,
        });
        if (cancelled || !res.ok) return;
        const json = (await res.json()) as { schedules?: ScheduledDeparture[] };
        if (!cancelled) setSchedules(json.schedules ?? []);
      } catch {
        // AbortError on unmount is fine; genuine errors fall through to empty list.
      }
    }

    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(id);
    };
  }, [key]);

  return schedules;
}
