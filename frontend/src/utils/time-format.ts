export function formatMinutesUntil(isoTime: string, now: Date = new Date()): string {
  const target = new Date(isoTime);
  const diffMs = target.getTime() - now.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 0) return 'Departed';
  if (diffMin < 1) return 'Arriving';
  return `${diffMin} min`;
}

export function formatArrival(arrivalTime: string | null, status: string | null): string {
  if (status) return status;
  if (arrivalTime) return formatMinutesUntil(arrivalTime);
  return '';
}
