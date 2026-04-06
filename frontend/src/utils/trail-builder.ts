export function buildTrail(routeCoords: [number, number][], headIndex: number, trailLength: number): [number, number][] {
  const startIdx = Math.max(0, headIndex - trailLength + 1);
  return routeCoords.slice(startIdx, headIndex + 1);
}
