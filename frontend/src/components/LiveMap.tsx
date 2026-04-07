import { useState, useEffect, useCallback, useMemo } from 'react';
import { Map as MapGL } from 'react-map-gl/maplibre';
import { DeckGL } from '@deck.gl/react';
import type { PickingInfo } from '@deck.gl/core';
import { createRouteLayer, type RoutePathData } from '../layers/RouteLayer';
import { createStationLayer } from '../layers/StationLayer';
import { createTrainLayer, type TrainTripData } from '../layers/TrainLayer';
import { createAlertLayer, getAlertSegments } from '../layers/AlertLayer';
import { createAccessibilityLayer, buildAccessibilityData } from '../layers/AccessibilityLayer';
import { useTrainTrips, useAnimationTime } from '../hooks/useTrainPositions';
import { TrainTooltip } from '../overlays/TrainTooltip';
import { AlertBanner } from '../overlays/AlertBanner';
import type { Vehicle, Prediction, Alert, FacilityWithStatus, Stop } from '../types';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_API_KEY ?? '';
const MAP_STYLE = `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`;

// Matching London Underground: zoom 14, pitch 50
const INITIAL_VIEW_STATE = {
  longitude: -71.0565,
  latitude: 42.3555,
  zoom: 14,
  pitch: 50,
  bearing: 0,
};

interface LiveMapProps {
  vehicles: Vehicle[];
  predictions: Record<string, Prediction[]>;
  alerts: Alert[];
  facilities: FacilityWithStatus[];
  accessibilityOn: boolean;
}

export function LiveMap({ vehicles, predictions, alerts, facilities, accessibilityOn }: LiveMapProps) {
  const [routeShapes, setRouteShapes] = useState<globalThis.Map<string, RoutePathData[]>>(new globalThis.Map());
  const [stops, setStops] = useState<Stop[]>([]);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; trip: TrainTripData } | null>(null);

  // Load shapes and stops once
  useEffect(() => {
    async function loadData() {
      try {
        const [shapesRes, stopsRes] = await Promise.all([
          fetch('/api/shapes'),
          fetch('/api/stops'),
        ]);

        const shapesJson = await shapesRes.json();
        const shapesMap = new globalThis.Map<string, RoutePathData[]>();
        for (const [routeId, shapes] of Object.entries(shapesJson)) {
          shapesMap.set(routeId, (shapes as any[]).map((s) => ({
            routeId,
            // Backend sends [lat, lng], convert to [lng, lat] for deck.gl
            path: s.coordinates.map((c: [number, number]) => [c[1], c[0]]),
          })));
        }
        setRouteShapes(shapesMap);

        const stopsJson = await stopsRes.json();
        setStops(stopsJson.data.map((s: any) => ({
          id: s.id,
          name: s.attributes.name,
          latitude: s.attributes.latitude,
          longitude: s.attributes.longitude,
          wheelchairBoarding: s.attributes.wheelchair_boarding ?? 0,
          routeIds: [],
        })));
      } catch (err) {
        console.error('Failed to load map data:', err);
      }
    }
    loadData();
  }, []);

  // Static layers data
  const routePaths = useMemo(() => {
    const paths: RoutePathData[] = [];
    routeShapes.forEach((shapes) => { for (const shape of shapes) paths.push(shape); });
    return paths;
  }, [routeShapes]);

  const brokenFacilityStopIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of facilities) { if (f.status?.status === 'OUT_OF_ORDER') ids.add(f.facility.stopId); }
    return ids;
  }, [facilities]);

  const alertSegments = useMemo(() => getAlertSegments(alerts, routeShapes), [alerts, routeShapes]);
  const accessibilityData = useMemo(
    () => accessibilityOn ? buildAccessibilityData(stops, facilities) : [],
    [accessibilityOn, stops, facilities],
  );

  // Train trips + animation time (requestAnimationFrame loop like London Underground)
  const trips = useTrainTrips(vehicles, routeShapes);
  const currentTime = useAnimationTime();

  // Static layers (routes, stations, alerts, accessibility) — only rebuild when their data changes
  const staticLayers = useMemo(() => [
    createRouteLayer(routePaths),
    createStationLayer(stops, accessibilityOn, brokenFacilityStopIds),
    ...(alertSegments.length > 0 ? [createAlertLayer(alertSegments)] : []),
    ...(accessibilityData.length > 0 ? [createAccessibilityLayer(accessibilityData)] : []),
  ], [routePaths, stops, accessibilityOn, brokenFacilityStopIds, alertSegments, accessibilityData]);

  // All layers: static + animated trips layer (rebuilt every frame with new currentTime)
  // This matches London Underground's animate() loop exactly.
  const layers = useMemo(() => [
    staticLayers[0],                              // tube-lines (routes)
    createTrainLayer(trips, currentTime),          // trips (trains) — rebuilt every frame
    ...staticLayers.slice(1),                      // stations, alerts, accessibility
  ], [staticLayers, trips, currentTime]);

  const onHover = useCallback((info: PickingInfo) => {
    if ((info.layer as any)?.id === 'trips' && info.object) {
      setHoverInfo({ x: info.x, y: info.y, trip: info.object as TrainTripData });
    } else {
      setHoverInfo(null);
    }
  }, []);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <AlertBanner alerts={alerts} />
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
        onHover={onHover as any}
      >
        <MapGL mapStyle={MAP_STYLE} />
      </DeckGL>
      {hoverInfo && (
        <TrainTooltip
          x={hoverInfo.x} y={hoverInfo.y}
          routeId={hoverInfo.trip.routeId}
          directionId={hoverInfo.trip.directionId}
          stopId={hoverInfo.trip.stopId}
          predictions={predictions[hoverInfo.trip.stopId] ?? []}
          progress={hoverInfo.trip.progress}
        />
      )}
    </div>
  );
}
