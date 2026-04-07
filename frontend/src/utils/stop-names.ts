// Module-level cache for stop name lookups
let stopNameMap: Map<string, string> | null = null;

export function setStopNames(stops: { id: string; name: string }[]): void {
  stopNameMap = new Map();
  for (const stop of stops) {
    stopNameMap.set(stop.id, stop.name);
  }
}

export function getStopName(stopId: string): string {
  if (stopNameMap) {
    const name = stopNameMap.get(stopId);
    if (name) return name;
  }
  // Fallback: clean up the stop ID for display
  return stopId.replace('place-', '').replace(/-/g, ' ');
}
