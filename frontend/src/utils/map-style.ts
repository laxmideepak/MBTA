import type {
  AddLayerObject,
  Map as MapLibreMap,
  SourceSpecification,
  StyleSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import { buildMapTilerVintageStyle } from './maptiler-vintage-style';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_API_KEY ?? '';
const MAP_STYLE = (import.meta.env.VITE_MAP_STYLE ?? '').trim();

/**
 * Resolve the map style.
 *   Default (with MapTiler key): inline VINTAGE parchment style — matches
 *                                londonunderground.live's aesthetic exactly.
 *   Default (no key):            OpenFreeMap Positron — minimal light style.
 *   VITE_MAP_STYLE=<url>:        caller-supplied style URL.
 *   VITE_MAP_STYLE=streets:      force streets-v2 (with key) / bright (without).
 */
export function getMapStyle(): string | StyleSpecification {
  const token = MAP_STYLE.toLowerCase();

  if (token === 'streets') {
    return MAPTILER_KEY
      ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`
      : 'https://tiles.openfreemap.org/styles/bright';
  }
  if (token === 'dark') {
    return MAPTILER_KEY
      ? `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}`
      : 'https://tiles.openfreemap.org/styles/dark';
  }
  if (MAP_STYLE && /^https?:\/\//.test(MAP_STYLE)) {
    return MAP_STYLE;
  }

  if (MAPTILER_KEY) {
    return buildMapTilerVintageStyle(MAPTILER_KEY);
  }
  return 'https://tiles.openfreemap.org/styles/positron';
}

/**
 * Adds a 3D fill-extrusion for buildings. MapTiler/OpenFreeMap are OpenMapTiles-based
 * but the vector source name can vary; attach to the first vector source found.
 */
export function add3DBuildingLayer(map: MapLibreMap): void {
  if (map.getLayer('3d-buildings')) return;

  const style = map.getStyle();
  const sources: Record<string, SourceSpecification> = style?.sources ?? {};
  const vectorSourceName = Object.keys(sources).find((name) => sources[name]?.type === 'vector');
  if (!vectorSourceName) return;

  const beforeId = style?.layers?.find(
    (l): l is SymbolLayerSpecification => l.type === 'symbol' && Boolean(l.layout?.['text-field']),
  )?.id;

  const layer: AddLayerObject = {
    id: '3d-buildings',
    type: 'fill-extrusion',
    source: vectorSourceName,
    'source-layer': 'building',
    minzoom: 14,
    paint: {
      'fill-extrusion-color': 'rgba(255,255,255,0.14)',
      'fill-extrusion-height': [
        'interpolate',
        ['linear'],
        ['zoom'],
        14,
        0,
        15,
        ['coalesce', ['get', 'render_height'], ['get', 'height'], 0],
      ],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
      'fill-extrusion-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        14,
        0.0,
        15,
        0.18,
        16,
        0.38,
        17,
        0.58,
      ],
    },
  };
  map.addLayer(layer, beforeId);
}
