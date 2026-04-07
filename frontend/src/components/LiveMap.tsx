import { useState, useEffect, useCallback, useMemo } from 'react';
import { Map as MapGL } from 'react-map-gl/maplibre';
import { DeckGL } from '@deck.gl/react';
import type { PickingInfo } from '@deck.gl/core';
import { createRouteLayer, type RoutePathData } from '../layers/RouteLayer';
import { createStationLayer } from '../layers/StationLayer';
import { createTrainLayer, type TripData } from '../layers/TrainLayer';
import { createAlertLayer, getAlertSegments } from '../layers/AlertLayer';
import { createAccessibilityLayer, buildAccessibilityData } from '../layers/AccessibilityLayer';
import { useTrainTrips, useAnimatedTime } from '../hooks/useTrainPositions';
import { TrainTooltip } from '../overlays/TrainTooltip';
import { AlertBanner } from '../overlays/AlertBanner';
import type { Vehicle, Prediction, Alert, FacilityWithStatus, Stop } from '../types';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_API_KEY ?? '';
const MAP_STYLE = `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`;

const INITIAL_VIEW_STATE = {
  longitude: -71.0565,
  latitude: 42.3555,
  zoom: 13,
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
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; trip: TripData } | null>(null);

  // Load shapes and stops on mount
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
            path: s.coordinates.map((c: [number, number]) => [c[1], c[0]]),
          })));
        }
        setRouteShapes(shapesMap);

        const stopsJson = await stopsRes.json();
        const parsedStops: Stop[] = stopsJson.data.map((s: any) => ({
          id: s.id, name: s.attributes.name,
          latitude: s.attributes.latitude, longitude: s.attributes.longitude,
          wheelchairBoarding: s.attributes.wheelchair_boarding ?? 0, routeIds: [],
        }));
        setStops(parsedStops);
      } catch (err) { console.error('Failed to load map data:', err); }
    }
    loadData();
  }, []);

  // Flatten route paths
  const routePaths = useMemo(() => {
    const paths: RoutePathData[] = [];
    routeShapes.forEach((shapes) => { for (const shape of shapes) paths.push(shape); });
    return paths;
  }, [routeShapes]);

  // Build trip data for TripsLayer
  const trips = useTrainTrips(vehicles, routeShapes);
  const currentTime = useAnimatedTime(trips);

  // Broken facilities
  const brokenFacilityStopIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of facilities) { if (f.status?.status === 'OUT_OF_ORDER') ids.add(f.facility.stopId); }
    return ids;
  }, [facilities]);

  // Alert + accessibility data
  const alertSegments = useMemo(() => getAlertSegments(alerts, routeShapes), [alerts, routeShapes]);
  const accessibilityData = useMemo(() => accessibilityOn ? buildAccessibilityData(stops, facilities) : [], [accessibilityOn, stops, facilities]);

  // Build all layers
  const layers = useMemo(() => [
    createRouteLayer(routePaths),
    createStationLayer(stops, accessibilityOn, brokenFacilityStopIds),
    createTrainLayer(trips, currentTime),
    ...(alertSegments.length > 0 ? [createAlertLayer(alertSegments)] : []),
    ...(accessibilityData.length > 0 ? [createAccessibilityLayer(accessibilityData)] : []),
  ], [routePaths, stops, trips, currentTime, accessibilityOn, brokenFacilityStopIds, alertSegments, accessibilityData]);

  const onHover = useCallback((info: PickingInfo) => {
    if ((info.layer as any)?.id === 'train-trails' && info.object) {
      setHoverInfo({ x: info.x, y: info.y, trip: info.object as TripData });
    } else { setHoverInfo(null); }
  }, []);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <AlertBanner alerts={alerts} />
      <DeckGL initialViewState={INITIAL_VIEW_STATE} controller={true} layers={layers} onHover={onHover as any}>
        <MapGL mapStyle={MAP_STYLE} />
      </DeckGL>
      {hoverInfo && (
        <TrainTooltip
          x={hoverInfo.x} y={hoverInfo.y}
          routeId={hoverInfo.trip.routeId} directionId={hoverInfo.trip.directionId}
          stopId={hoverInfo.trip.stopId}
          predictions={predictions[hoverInfo.trip.stopId] ?? []}
          progress={hoverInfo.trip.progress}
        />
      )}
    </div>
  );
}
