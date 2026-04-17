import type { Layer, PickingInfo } from '@deck.gl/core';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { useEffect, useRef } from 'react';
import type { Stop } from '../types';
import { getRouteColor } from '../utils/mbta-colors';

export interface StationHoverInfo {
  x: number;
  y: number;
  object: Stop;
}

type RouteSegment = { routeId: string; path: [number, number][] };

// London-style hair-thin pastel track: blend route color ~75% toward the
// cream basemap (#f5f0d9). Result is a barely-there tint that preserves line
// identity without competing with the moving TripsLayer comet on top.
function toLightTrackColor(routeId: string): [number, number, number, number] {
  const [r, g, b] = getRouteColor(routeId);
  const blend = 0.75;
  const [br, bg, bb] = [0xf5, 0xf0, 0xd9];
  return [
    Math.round(r + (br - r) * blend),
    Math.round(g + (bg - g) * blend),
    Math.round(b + (bb - b) * blend),
    170,
  ];
}

// Base rail polylines are intentionally dim so the bright animated TripsLayer
// trains on top dominate the visual hierarchy (PRD §2.5 / Fix 3 diagnosis).
// londonunderground.live's tracks sit at roughly ~30% brightness of the train
// colour — we match that here with alpha 60/255 + overall opacity 0.35.
export function useMapLayers(
  routeShapes: Map<string, { routeId: string; path: [number, number][] }[]>,
  stops: Stop[],
  onStationHover: (info: StationHoverInfo | null) => void,
) {
  const staticLayersRef = useRef<Layer[]>([]);

  useEffect(() => {
    if (routeShapes.size === 0) return;

    const routeSegments: RouteSegment[] = [];
    for (const [routeId, shapes] of routeShapes) {
      for (const shape of shapes) {
        routeSegments.push({ routeId, path: shape.path });
      }
    }

    const routeLayer = new PathLayer<RouteSegment>({
      id: 'route-tracks',
      data: routeSegments,
      pickable: false,
      getPath: (d) => d.path,
      widthUnits: 'pixels',
      widthMinPixels: 0.75,
      widthMaxPixels: 1.8,
      getWidth: 1,
      getColor: (d) => toLightTrackColor(d.routeId),
      opacity: 0.7,
      // deck.gl 9 uses luma.gl 9 WebGPU-style params. "Always pass, never write"
      // keeps the track layers visible regardless of z so the glowing TripsLayer
      // on top is never occluded.
      parameters: { depthCompare: 'always', depthWriteEnabled: false },
    });

    // London-style stations: small unfilled black-rimmed dots on cream.
    const stationLayer = new ScatterplotLayer<Stop>({
      id: 'stations',
      data: stops,
      getPosition: (d) => [d.longitude, d.latitude, 0],
      getFillColor: [245, 240, 217, 255],
      getLineColor: [40, 40, 40, 200],
      getLineWidth: 0.8,
      lineWidthUnits: 'pixels',
      stroked: true,
      filled: true,
      radiusUnits: 'meters',
      getRadius: 18,
      radiusMinPixels: 1.5,
      radiusMaxPixels: 3.5,
      pickable: true,
      onHover: ({ object, x, y }: PickingInfo) => {
        onStationHover(object ? { x, y, object: object as Stop } : null);
      },
    });

    staticLayersRef.current = [routeLayer, stationLayer];
  }, [routeShapes, stops, onStationHover]);

  return staticLayersRef;
}
