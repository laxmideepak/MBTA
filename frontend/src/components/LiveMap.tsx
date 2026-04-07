import { useEffect, useRef, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { GeoJsonLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { getRouteColor } from '../utils/mbta-colors';
import { findNearestPointIndex } from '../utils/snap-to-route';
import { AlertBanner } from '../overlays/AlertBanner';
import { TrainTooltip } from '../overlays/TrainTooltip';
import type { Vehicle, Prediction, Alert, FacilityWithStatus, Stop } from '../types';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_API_KEY ?? '';

// Clean dark style — try streets-v2-dark for an Uber-like look
const MAP_STYLE = `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}`;

// ──────────────────────────────────────────────
// UBER-STYLE INTERPOLATION ENGINE
// ──────────────────────────────────────────────
// Each vehicle has:
//   prevIdx  — route index at previous GPS update
//   targetIdx — route index at current GPS update
//   currentIdx — smoothly interpolated float between prevIdx and targetIdx
//
// The animation loop lerps currentIdx toward targetIdx every frame.
// The train "dot" is placed at the interpolated position on the route.
// A trail of N route points behind currentIdx forms the colored tail.

interface TrainState {
  vehicleId: string;
  routeId: string;
  directionId: number;
  stopId: string;
  label: string;
  routeCoords: [number, number][];
  prevIdx: number;
  targetIdx: number;
  currentIdx: number;      // float — smoothly interpolated
  lastUpdateTime: number;  // timestamp when target was set
}

// How fast to lerp: 0.03 = smooth, 0.1 = snappy
const LERP_SPEED = 0.04;
// Trail length (number of route points behind the train head)
const TRAIL_LENGTH = 50;

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
  const trainStatesRef = useRef<Map<string, TrainState>>(new Map());
  const staticLayersDataRef = useRef<any[]>([]);

  const [routeShapes, setRouteShapes] = useState<Map<string, { routeId: string; path: [number, number][] }[]>>(new Map());
  const [stops, setStops] = useState<Stop[]>([]);
  const [hoverInfo, setHoverInfo] = useState<{
    x: number; y: number;
    routeId: string; directionId: number; stopId: string; progress: number;
  } | null>(null);

  const brokenStopIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of facilities) {
      if (f.status?.status === 'OUT_OF_ORDER') ids.add(f.facility.stopId);
    }
    return ids;
  }, [facilities]);

  // ── Update train states when new vehicle data arrives ──
  useEffect(() => {
    if (routeShapes.size === 0) return;
    const states = trainStatesRef.current;
    const seen = new Set<string>();

    for (const vehicle of vehicles) {
      seen.add(vehicle.id);
      const shapes = routeShapes.get(vehicle.routeId);
      if (!shapes || shapes.length === 0) continue;

      const shape = shapes[Math.min(vehicle.directionId, shapes.length - 1)] ?? shapes[0];
      const coords = shape.path;
      if (coords.length < 2) continue;

      const newTargetIdx = findNearestPointIndex(vehicle.longitude, vehicle.latitude, coords);
      const existing = states.get(vehicle.id);

      if (existing && existing.routeId === vehicle.routeId && existing.directionId === vehicle.directionId) {
        // Same route/direction — update target, start lerping from current position
        existing.prevIdx = existing.currentIdx;
        existing.targetIdx = newTargetIdx;
        existing.stopId = vehicle.stopId;
        existing.lastUpdateTime = Date.now();
      } else {
        // New vehicle or changed route — snap immediately
        states.set(vehicle.id, {
          vehicleId: vehicle.id,
          routeId: vehicle.routeId,
          directionId: vehicle.directionId,
          stopId: vehicle.stopId,
          label: vehicle.label,
          routeCoords: coords,
          prevIdx: newTargetIdx,
          targetIdx: newTargetIdx,
          currentIdx: newTargetIdx,
          lastUpdateTime: Date.now(),
        });
      }
    }

    // Remove vehicles that are no longer in the feed
    for (const [id] of states) {
      if (!seen.has(id)) states.delete(id);
    }
  }, [vehicles, routeShapes]);

  // ── Initialize map once ──
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: [-71.0565, 42.3555],
      zoom: 13,
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
      const overlay = new MapboxOverlay({ layers: [] });
      map.addControl(overlay as any);
      overlayRef.current = overlay;

      // ── ANIMATION LOOP (Uber-style) ──
      const animate = () => {
        if (!overlayRef.current) return;

        const states = trainStatesRef.current;
        const staticLayers = staticLayersDataRef.current;

        // ── LERP all trains toward their targets ──
        for (const [, state] of states) {
          const diff = state.targetIdx - state.currentIdx;
          if (Math.abs(diff) < 0.5) {
            state.currentIdx = state.targetIdx;
          } else {
            state.currentIdx += diff * LERP_SPEED;
          }
        }

        // ── Build trail data (PathLayer) ──
        const trailData: { vehicleId: string; routeId: string; directionId: number; stopId: string; trail: [number, number][]; progress: number }[] = [];
        // ── Build dot data (ScatterplotLayer) ──
        const dotData: { vehicleId: string; routeId: string; directionId: number; stopId: string; position: [number, number]; progress: number }[] = [];

        for (const [, state] of states) {
          const coords = state.routeCoords;
          const headFloat = state.currentIdx;
          const headIdx = Math.round(headFloat);
          const clampedHead = Math.max(0, Math.min(coords.length - 1, headIdx));

          // Interpolated position between two route points
          const floorIdx = Math.max(0, Math.min(coords.length - 2, Math.floor(headFloat)));
          const frac = headFloat - floorIdx;
          const p0 = coords[floorIdx];
          const p1 = coords[Math.min(floorIdx + 1, coords.length - 1)];
          const interpPos: [number, number] = [
            p0[0] + (p1[0] - p0[0]) * frac,
            p0[1] + (p1[1] - p0[1]) * frac,
          ];

          const progress = Math.round((clampedHead / Math.max(1, coords.length - 1)) * 100);

          // Trail: TRAIL_LENGTH points behind the head
          const trailStart = Math.max(0, clampedHead - TRAIL_LENGTH);
          const trail = coords.slice(trailStart, clampedHead + 1);
          // Append the interpolated head position
          if (trail.length > 0) {
            trail.push(interpPos);
          }

          if (trail.length >= 2) {
            trailData.push({
              vehicleId: state.vehicleId,
              routeId: state.routeId,
              directionId: state.directionId,
              stopId: state.stopId,
              trail,
              progress,
            });
          }

          dotData.push({
            vehicleId: state.vehicleId,
            routeId: state.routeId,
            directionId: state.directionId,
            stopId: state.stopId,
            position: interpPos,
            progress,
          });
        }

        // ── Train trails ──
        const trailLayer = new PathLayer({
          id: 'train-trails',
          data: trailData,
          getPath: (d: any) => d.trail,
          getColor: (d: any) => {
            const base = getRouteColor(d.routeId);
            return [
              Math.min(255, Math.floor(base[0] * 1.2)),
              Math.min(255, Math.floor(base[1] * 1.2)),
              Math.min(255, Math.floor(base[2] * 1.2)),
              200,
            ];
          },
          getWidth: 6,
          widthUnits: 'pixels',
          widthMinPixels: 4,
          widthMaxPixels: 10,
          capRounded: true,
          jointRounded: true,
          pickable: true,
          onHover: ({ object, x, y }: any) => {
            if (object) {
              setHoverInfo({ x, y, routeId: object.routeId, directionId: object.directionId, stopId: object.stopId, progress: object.progress });
            } else {
              setHoverInfo(null);
            }
          },
        } as any);

        // ── Train head dots ──
        const dotLayer = new ScatterplotLayer({
          id: 'train-dots',
          data: dotData,
          getPosition: (d: any) => d.position,
          getFillColor: (d: any) => [...getRouteColor(d.routeId), 255],
          getLineColor: [255, 255, 255, 220],
          getRadius: 6,
          radiusUnits: 'pixels',
          radiusMinPixels: 4,
          radiusMaxPixels: 10,
          stroked: true,
          lineWidthMinPixels: 2,
          pickable: true,
          onHover: ({ object, x, y }: any) => {
            if (object) {
              setHoverInfo({ x, y, routeId: object.routeId, directionId: object.directionId, stopId: object.stopId, progress: object.progress });
            } else {
              setHoverInfo(null);
            }
          },
        } as any);

        overlayRef.current.setProps({
          layers: [...staticLayers, trailLayer, dotLayer],
        });

        requestAnimationFrame(animate);
      };

      animate();
    });

    // ── Load shapes + stops ──
    Promise.all([fetch('/api/shapes'), fetch('/api/stops')])
      .then(async ([shapesRes, stopsRes]) => {
        const shapesJson = await shapesRes.json();
        const shapesMap = new Map<string, { routeId: string; path: [number, number][] }[]>();
        for (const [routeId, shapes] of Object.entries(shapesJson)) {
          shapesMap.set(routeId, (shapes as any[]).map((s) => ({
            routeId,
            path: s.coordinates.map((c: [number, number]) => [c[1], c[0]]),
          })));
        }
        setRouteShapes(shapesMap);

        const stopsJson = await stopsRes.json();
        setStops(stopsJson.data.map((s: any) => ({
          id: s.id, name: s.attributes.name,
          latitude: s.attributes.latitude, longitude: s.attributes.longitude,
          wheelchairBoarding: s.attributes.wheelchair_boarding ?? 0, routeIds: [],
        })));
      })
      .catch(console.error);

    return () => { map.remove(); mapRef.current = null; overlayRef.current = null; };
  }, []);

  // ── Update static layers ──
  useEffect(() => {
    if (routeShapes.size === 0) return;

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
      id: 'route-lines',
      data: { type: 'FeatureCollection', features: routeFeatures },
      pickable: false,
      stroked: false,
      filled: false,
      lineWidthMinPixels: 10,
      getLineColor: (f: any) => [...getRouteColor(f.properties.routeId), 70],
      getLineWidth: 1,
      parameters: { depthTest: false, depthWrite: false },
    } as any);

    const stationLayer = new ScatterplotLayer({
      id: 'stations',
      data: stops,
      getPosition: (d: Stop) => [d.longitude, d.latitude, 0],
      getFillColor: (d: Stop) => {
        if (accessibilityOn && brokenStopIds.has(d.id)) return [244, 67, 54, 200];
        return [255, 255, 255, 140];
      },
      getLineColor: [0, 0, 0, 120],
      getLineWidth: 3,
      lineWidthUnits: 'meters' as const,
      stroked: true,
      filled: true,
      radiusUnits: 'meters' as const,
      getRadius: 40,
      radiusMinPixels: 2,
      radiusMaxPixels: 14,
      pickable: true,
    } as any);

    staticLayersDataRef.current = [routeLayer, stationLayer];
  }, [routeShapes, stops, accessibilityOn, brokenStopIds]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <AlertBanner alerts={alerts} />
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
      {hoverInfo && (
        <TrainTooltip
          x={hoverInfo.x} y={hoverInfo.y}
          routeId={hoverInfo.routeId}
          directionId={hoverInfo.directionId}
          stopId={hoverInfo.stopId}
          predictions={predictions[hoverInfo.stopId] ?? []}
          progress={hoverInfo.progress}
        />
      )}
    </div>
  );
}
