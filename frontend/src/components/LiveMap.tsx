import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { TripsLayer } from '@deck.gl/geo-layers';
import { LightingEffect } from '@deck.gl/core';
import { getRouteColor } from '../utils/mbta-colors';
import { findNearestPointIndex } from '../utils/snap-to-route';
import { AlertBanner } from '../overlays/AlertBanner';
import { TrainTooltip } from '../overlays/TrainTooltip';
import type { Vehicle, Prediction, Alert, FacilityWithStatus, Stop } from '../types';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_API_KEY ?? '';
const MAP_STYLE = `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`;

// Exact same as London Underground
function getSecondsSinceUtcMidnight(): number {
  const now = new Date();
  return now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 +
    now.getUTCSeconds() + now.getUTCMilliseconds() / 1000;
}

interface RoutePathData {
  routeId: string;
  path: [number, number][];
}

interface TrainTrip {
  vehicleId: string;
  routeId: string;
  path: [number, number][];
  timestamps: number[];
  directionId: number;
  stopId: string;
  label: string;
  progress: number;
}

interface LiveMapProps {
  vehicles: Vehicle[];
  predictions: Record<string, Prediction[]>;
  alerts: Alert[];
  facilities: FacilityWithStatus[];
  accessibilityOn: boolean;
}

export function LiveMap({ vehicles, predictions, alerts, facilities, accessibilityOn }: LiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const routeShapesRef = useRef<Map<string, RoutePathData[]>>(new Map());
  const stopsRef = useRef<Stop[]>([]);
  const tripsLayerConfigRef = useRef<any>(null);
  const staticLayersRef = useRef<any[]>([]);

  const [routeShapes, setRouteShapes] = useState<Map<string, RoutePathData[]>>(new Map());
  const [stops, setStops] = useState<Stop[]>([]);
  const [hoverInfo, setHoverInfo] = useState<{
    x: number; y: number; trip: TrainTrip;
  } | null>(null);

  // Build train trips from vehicles + route shapes
  const trips = useMemo((): TrainTrip[] => {
    if (routeShapes.size === 0 || vehicles.length === 0) return [];
    const now = getSecondsSinceUtcMidnight();
    const result: TrainTrip[] = [];

    for (const vehicle of vehicles) {
      const shapes = routeShapes.get(vehicle.routeId);
      if (!shapes || shapes.length === 0) continue;
      const shape = shapes[Math.min(vehicle.directionId, shapes.length - 1)] ?? shapes[0];
      const coords = shape.path;
      if (coords.length < 2) continue;

      const headIdx = findNearestPointIndex(vehicle.longitude, vehicle.latitude, coords);
      const progress = Math.round((headIdx / (coords.length - 1)) * 100);
      // Timestamps: each coord is 1 second apart, head = now
      const timestamps = coords.map((_, i) => now - (headIdx - i));

      result.push({
        vehicleId: vehicle.id,
        routeId: vehicle.routeId,
        path: coords,
        timestamps,
        directionId: vehicle.directionId,
        stopId: vehicle.stopId,
        label: vehicle.label,
        progress,
      });
    }
    return result;
  }, [vehicles, routeShapes]);

  // Initialize map + overlay once
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: [-71.0565, 42.3555],
      zoom: 14,
      pitch: 50,
      bearing: 0,
      antialias: true,
      dragRotate: true,
      maxPitch: 85,
      maxZoom: 20,
    });

    map.addControl(new maplibregl.NavigationControl());
    mapRef.current = map;

    map.on('load', () => {
      // Create lighting effect
      const lightingEffect = new LightingEffect({});

      // Create overlay
      const overlay = new MapboxOverlay({
        layers: [],
        effects: [lightingEffect],
      });
      map.addControl(overlay as any);
      overlayRef.current = overlay;

      // Start animation loop — exact same as London Underground
      const animate = () => {
        if (!overlayRef.current) return;
        const currentTrips = (window as any).__mbtaTrips || [];
        const currentStaticLayers = (window as any).__mbtaStaticLayers || [];

        const tripsLayer = new TripsLayer({
          id: 'trips',
          data: currentTrips,
          getPath: (d: any) => d.path,
          getTimestamps: (d: any) => d.timestamps,
          getColor: (d: any) => {
            const base = getRouteColor(d.routeId);
            return [Math.floor(base[0] * 0.7), Math.floor(base[1] * 0.7), Math.floor(base[2] * 0.7)];
          },
          opacity: 1,
          widthMinPixels: 7,
          billboard: false,
          jointRounded: true,
          capRounded: true,
          trailLength: 20,
          currentTime: getSecondsSinceUtcMidnight(),
          parameters: { depthTest: true, depthWrite: true },
          pickable: true,
          onHover: ({ object, x, y }: any) => {
            if (object) {
              setHoverInfo({ x, y, trip: object });
            } else {
              setHoverInfo(null);
            }
          },
        } as any);

        overlayRef.current.setProps({
          layers: [
            ...currentStaticLayers,
            tripsLayer,
          ],
        });

        requestAnimationFrame(animate);
      };

      animate();
    });

    // Load shapes + stops
    Promise.all([fetch('/api/shapes'), fetch('/api/stops')])
      .then(async ([shapesRes, stopsRes]) => {
        const shapesJson = await shapesRes.json();
        const shapesMap = new Map<string, RoutePathData[]>();
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
      })
      .catch(console.error);

    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  // Update static layers when routes/stops/alerts change
  useEffect(() => {
    if (routeShapes.size === 0) return;

    // Flatten routes to GeoJSON
    const routeFeatures: any[] = [];
    routeShapes.forEach((shapes) => {
      for (const shape of shapes) {
        routeFeatures.push({
          type: 'Feature',
          properties: { routeId: shape.routeId },
          geometry: { type: 'LineString', coordinates: shape.path },
        });
      }
    });

    const routeLayer = new GeoJsonLayer({
      id: 'tube-lines',
      data: { type: 'FeatureCollection', features: routeFeatures },
      pickable: false,
      stroked: false,
      filled: false,
      lineWidthScale: 1,
      lineWidthMinPixels: 12,
      getLineColor: (f: any) => [...getRouteColor(f.properties.routeId), 50],
      getLineWidth: 1,
      parameters: { depthTest: false, depthWrite: false },
    } as any);

    const stationLayer = new ScatterplotLayer({
      id: 'stations',
      data: stops,
      getPosition: (d: Stop) => [d.longitude, d.latitude, 0],
      getFillColor: (d: Stop) => {
        if (accessibilityOn && brokenStopIds.has(d.id)) return [244, 67, 54, 200];
        return [255, 255, 255, 153];
      },
      getLineColor: [0, 0, 0, 153],
      getLineWidth: 4,
      lineWidthUnits: 'meters' as const,
      stroked: true,
      filled: true,
      radiusUnits: 'meters' as const,
      getRadius: 50,
      radiusMinPixels: 1,
      radiusMaxPixels: 20,
      pickable: true,
    } as any);

    const staticLayers = [routeLayer, stationLayer];
    (window as any).__mbtaStaticLayers = staticLayers;
  }, [routeShapes, stops, accessibilityOn, facilities]);

  // Broken facility stop IDs
  const brokenStopIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of facilities) {
      if (f.status?.status === 'OUT_OF_ORDER') ids.add(f.facility.stopId);
    }
    return ids;
  }, [facilities]);

  // Push trips to window for the animate loop to read
  useEffect(() => {
    (window as any).__mbtaTrips = trips;
  }, [trips]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <AlertBanner alerts={alerts} />
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
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
