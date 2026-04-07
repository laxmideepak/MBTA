function distSq(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const dLng = lng1 - lng2; const dLat = lat1 - lat2;
  return dLng * dLng + dLat * dLat;
}

export function findNearestPointIndex(lng: number, lat: number, routeCoords: [number, number][]): number {
  let minDist = Infinity; let minIdx = 0;
  for (let i = 0; i < routeCoords.length; i++) {
    const d = distSq(lng, lat, routeCoords[i][0], routeCoords[i][1]);
    if (d < minDist) { minDist = d; minIdx = i; }
  }
  return minIdx;
}
