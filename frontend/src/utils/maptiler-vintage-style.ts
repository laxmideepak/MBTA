import type { StyleSpecification } from 'maplibre-gl';

/**
 * Vintage parchment / cream basemap over MapTiler v3 vector tiles
 * (inspired by londonunderground.live’s light MapTiler style).
 * Requires a MapTiler API key (same as VITE_MAPTILER_API_KEY).
 */
export function buildMapTilerVintageStyle(apiKey: string): StyleSpecification {
  const q = encodeURIComponent(apiKey);
  return {
    version: 8,
    name: 'Boston Vintage (MapTiler)',
    glyphs: `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${q}`,
    sources: {
      'simple-tiles': {
        type: 'vector',
        tiles: [`https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=${q}`],
        minzoom: 0,
        maxzoom: 14,
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#f5f0d9' },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'simple-tiles',
        'source-layer': 'water',
        paint: { 'fill-color': '#e8e0c0' },
      },
      {
        id: 'landuse_park',
        type: 'fill',
        source: 'simple-tiles',
        'source-layer': 'landuse',
        filter: ['==', ['get', 'class'], 'park'],
        paint: {
          'fill-color': '#ede5c9',
          'fill-opacity': 0.7,
        },
      },
      {
        id: 'roads_minor',
        type: 'line',
        source: 'simple-tiles',
        'source-layer': 'transportation',
        filter: ['!', ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], true, false]],
        paint: {
          'line-color': '#d9d0b3',
          'line-width': 0.5,
        },
      },
      {
        id: 'roads_major',
        type: 'line',
        source: 'simple-tiles',
        'source-layer': 'transportation',
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], true, false],
        paint: {
          'line-color': '#c5b99c',
          'line-width': 1,
        },
      },
      {
        id: '3d-buildings',
        type: 'fill-extrusion',
        source: 'simple-tiles',
        'source-layer': 'building',
        minzoom: 14,
        filter: ['!=', ['get', 'hide_3d'], true],
        paint: {
          'fill-extrusion-color': '#8EEDC7',
          'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 0.35, 16, 0.4],
          'fill-extrusion-height': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13,
            0,
            15,
            ['coalesce', ['get', 'render_height'], ['get', 'height'], 0],
          ],
          'fill-extrusion-base': [
            'coalesce',
            ['get', 'render_min_height'],
            ['get', 'min_height'],
            0,
          ],
        },
      },
      {
        id: 'area-labels',
        type: 'symbol',
        source: 'simple-tiles',
        'source-layer': 'place',
        filter: ['match', ['get', 'class'], ['suburb', 'district', 'neighbourhood'], true, false],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.1,
          'text-max-width': 7,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#000000',
          'text-halo-color': 'rgba(245, 240, 217, 0.8)',
          'text-halo-width': 1,
        },
      },
      {
        id: 'major-labels',
        type: 'symbol',
        source: 'simple-tiles',
        'source-layer': 'place',
        filter: ['match', ['get', 'class'], ['city', 'town'], true, false],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 14,
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.1,
          'text-max-width': 7,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#000000',
          'text-halo-color': 'rgba(245, 240, 217, 0.8)',
          'text-halo-width': 1,
        },
      },
      {
        id: 'place_labels',
        type: 'symbol',
        source: 'simple-tiles',
        'source-layer': 'place',
        filter: [
          '!',
          [
            'match',
            ['get', 'class'],
            ['suburb', 'district', 'neighbourhood', 'city', 'town'],
            true,
            false,
          ],
        ],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 14,
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.1,
          'text-max-width': 7,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#000000',
          'text-halo-color': 'rgba(245, 240, 217, 0.8)',
          'text-halo-width': 1,
        },
      },
    ],
  };
}
