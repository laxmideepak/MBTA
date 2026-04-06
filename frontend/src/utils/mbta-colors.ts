export const MBTA_COLORS: Record<string, [number, number, number]> = {
  'Red': [218, 41, 28], 'Orange': [237, 139, 0], 'Blue': [0, 61, 165],
  'Green-B': [0, 132, 61], 'Green-C': [0, 153, 68], 'Green-D': [0, 166, 80],
  'Green-E': [0, 178, 92], 'Mattapan': [218, 41, 28],
};

export const MBTA_COLORS_HEX: Record<string, string> = {
  'Red': '#DA291C', 'Orange': '#ED8B00', 'Blue': '#003DA5',
  'Green-B': '#00843D', 'Green-C': '#009944', 'Green-D': '#00A650',
  'Green-E': '#00B25C', 'Mattapan': '#DA291C',
};

export function getRouteColor(routeId: string): [number, number, number] {
  return MBTA_COLORS[routeId] ?? [128, 128, 128];
}

export function getRouteColorHex(routeId: string): string {
  return MBTA_COLORS_HEX[routeId] ?? '#808080';
}

export function getRouteDisplayName(routeId: string): string {
  const names: Record<string, string> = {
    'Red': 'Red Line', 'Orange': 'Orange Line', 'Blue': 'Blue Line',
    'Green-B': 'Green Line B', 'Green-C': 'Green Line C',
    'Green-D': 'Green Line D', 'Green-E': 'Green Line E',
    'Mattapan': 'Mattapan Trolley',
  };
  return names[routeId] ?? routeId;
}

export const ALL_ROUTE_IDS = ['Red', 'Orange', 'Blue', 'Green-B', 'Green-C', 'Green-D', 'Green-E', 'Mattapan'];
