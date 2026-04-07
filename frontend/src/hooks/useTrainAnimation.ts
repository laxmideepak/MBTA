import { useEffect, useRef } from 'react';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { findNearestPointIndex } from '../utils/snap-to-route';
import { getRouteColor } from '../utils/mbta-colors';
import type { Vehicle } from '../types';

export interface TrainState {
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

export function useTrainAnimation(
  vehicles: Vehicle[],
  routeShapes: Map<string, { routeId: string; path: [number, number][] }[]>,
) {
  const trainStatesRef = useRef<Map<string, TrainState>>(new Map());

  // Update train states when new vehicle data arrives
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

  function getTrailData() {
    const states = trainStatesRef.current;
    const trailData: {
      vehicleId: string; routeId: string; directionId: number;
      stopId: string; trail: [number, number][]; progress: number;
    }[] = [];

    for (const [, state] of states) {
      // Lerp currentIdx toward targetIdx
      const diff = state.targetIdx - state.currentIdx;
      if (Math.abs(diff) < 0.5) {
        state.currentIdx = state.targetIdx;
      } else {
        state.currentIdx += diff * LERP_SPEED;
      }

      const coords = state.routeCoords;
      const headFloat = state.currentIdx;
      const headIdx = Math.round(headFloat);
      const clampedHead = Math.max(0, Math.min(coords.length - 1, headIdx));

      const floorIdx = Math.max(0, Math.min(coords.length - 2, Math.floor(headFloat)));
      const frac = headFloat - floorIdx;
      const p0 = coords[floorIdx];
      const p1 = coords[Math.min(floorIdx + 1, coords.length - 1)];
      const interpPos: [number, number] = [
        p0[0] + (p1[0] - p0[0]) * frac,
        p0[1] + (p1[1] - p0[1]) * frac,
      ];

      const progress = Math.round((clampedHead / Math.max(1, coords.length - 1)) * 100);

      const trailStart = Math.max(0, clampedHead - TRAIL_LENGTH);
      const trail = coords.slice(trailStart, clampedHead + 1);
      if (trail.length > 0) trail.push(interpPos);

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
    }

    return trailData;
  }

  function getDotData() {
    const states = trainStatesRef.current;
    const dotData: {
      vehicleId: string; routeId: string; directionId: number;
      stopId: string; position: [number, number]; progress: number;
    }[] = [];

    for (const [, state] of states) {
      const coords = state.routeCoords;
      const headFloat = state.currentIdx;
      const headIdx = Math.round(headFloat);
      const clampedHead = Math.max(0, Math.min(coords.length - 1, headIdx));

      const floorIdx = Math.max(0, Math.min(coords.length - 2, Math.floor(headFloat)));
      const frac = headFloat - floorIdx;
      const p0 = coords[floorIdx];
      const p1 = coords[Math.min(floorIdx + 1, coords.length - 1)];
      const interpPos: [number, number] = [
        p0[0] + (p1[0] - p0[0]) * frac,
        p0[1] + (p1[1] - p0[1]) * frac,
      ];

      const progress = Math.round((clampedHead / Math.max(1, coords.length - 1)) * 100);

      dotData.push({
        vehicleId: state.vehicleId,
        routeId: state.routeId,
        directionId: state.directionId,
        stopId: state.stopId,
        position: interpPos,
        progress,
      });
    }

    return dotData;
  }

  function getTrainLayers(onHover: (info: any) => void) {
    const trailData = getTrailData();
    const dotData = getDotData();

    // Bright trail behind each train — full saturated line color, clearly visible
    const trailLayer = new PathLayer({
      id: 'train-trails',
      data: trailData,
      getPath: (d: any) => d.trail,
      getColor: (d: any) => [...getRouteColor(d.routeId), 255],
      getWidth: 8,
      widthUnits: 'pixels',
      widthMinPixels: 5,
      widthMaxPixels: 14,
      capRounded: true,
      jointRounded: true,
      pickable: true,
      onHover,
    } as any);

    // Outer glow ring around each train head — white halo for visibility
    const glowLayer = new ScatterplotLayer({
      id: 'train-glow',
      data: dotData,
      getPosition: (d: any) => d.position,
      getFillColor: (d: any) => [...getRouteColor(d.routeId), 60],
      getRadius: 18,
      radiusUnits: 'pixels',
      radiusMinPixels: 12,
      radiusMaxPixels: 30,
      stroked: false,
      filled: true,
      pickable: false,
    } as any);

    // Bright dot at the train head — large, white border, unmissable
    const dotLayer = new ScatterplotLayer({
      id: 'train-dots',
      data: dotData,
      getPosition: (d: any) => d.position,
      getFillColor: (d: any) => [...getRouteColor(d.routeId), 255],
      getLineColor: [255, 255, 255, 255],
      getRadius: 8,
      radiusUnits: 'pixels',
      radiusMinPixels: 6,
      radiusMaxPixels: 14,
      stroked: true,
      lineWidthMinPixels: 3,
      pickable: true,
      onHover,
    } as any);

    return [trailLayer, glowLayer, dotLayer];
  }

  return { trainStatesRef, getTrailData, getDotData, getTrainLayers };
}
