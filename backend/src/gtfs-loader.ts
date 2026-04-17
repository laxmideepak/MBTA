import { withMbtaKey } from './mbta-api-url.js';

export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

interface RouteShape {
  shapeId: string;
  routeId: string;
  coordinates: [number, number][];
}

export async function loadShapes(apiKey: string): Promise<Map<string, RouteShape[]>> {
  const routes = ['Red', 'Orange', 'Blue', 'Green-B', 'Green-C', 'Green-D', 'Green-E', 'Mattapan'];

  const results = await Promise.all(
    routes.map(async (routeId) => {
      const url = withMbtaKey(`https://api-v3.mbta.com/shapes?filter[route]=${routeId}`, apiKey);
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to fetch shapes for ${routeId}: ${response.status}`);
        return { routeId, shapes: [] as RouteShape[] };
      }
      const json = await response.json();
      const shapes: RouteShape[] = (json.data || []).map((resource: any) => ({
        shapeId: resource.id,
        routeId,
        coordinates: decodePolyline(resource.attributes.polyline as string),
      }));
      return { routeId, shapes };
    }),
  );

  const shapesByRoute = new Map<string, RouteShape[]>();
  for (const { routeId, shapes } of results) {
    shapesByRoute.set(routeId, shapes);
  }
  return shapesByRoute;
}
