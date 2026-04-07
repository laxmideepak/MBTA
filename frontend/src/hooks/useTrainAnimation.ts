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
  currentStatus: string;
  routeCoords: [number, number][];
  targetIdx: number;
  currentIdx: number;
  // Dead reckoning: estimated speed in route-indices-per-millisecond
  speed: number;
  lastUpdateTime: number;
  lastTargetIdx: number;     // target from the *previous* GPS update
  lastTargetTime: number;    // when that previous GPS update arrived
}

// Trail length (number of route points behind the train head)
const TRAIL_LENGTH = 40;
// When lerping to catch up to a new target, how fast (0-1 per frame)
const CATCHUP_SPEED = 0.06;
// Minimum speed (indices per ms) — prevents total standstill for in-transit trains
const MIN_SPEED = 0.0003; // ~0.3 index per second
// Maximum speed to prevent runaway
const MAX_SPEED = 0.005;

export function useTrainAnimation(
  vehicles: Vehicle[],
  routeShapes: Map<string, { routeId: string; path: [number, number][] }[]>,
) {
  const trainStatesRef = useRef<Map<string, TrainState>>(new Map());
  const lastFrameTimeRef = useRef(Date.now());

  // Update train states when new vehicle GPS data arrives
  useEffect(() => {
    if (routeShapes.size === 0) return;
    const states = trainStatesRef.current;
    const seen = new Set<string>();
    const now = Date.now();

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
        // Estimate speed from how far the target moved since last GPS update
        const timeDelta = now - existing.lastTargetTime;
        const idxDelta = Math.abs(newTargetIdx - existing.lastTargetIdx);
        if (timeDelta > 1000 && idxDelta > 0) {
          const estimatedSpeed = idxDelta / timeDelta;
          existing.speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, estimatedSpeed));
        }

        existing.lastTargetIdx = existing.targetIdx;
        existing.lastTargetTime = existing.lastUpdateTime;
        existing.targetIdx = newTargetIdx;
        existing.stopId = vehicle.stopId;
        existing.currentStatus = vehicle.currentStatus;
        existing.lastUpdateTime = now;
      } else {
        // New vehicle or changed route — snap immediately
        states.set(vehicle.id, {
          vehicleId: vehicle.id,
          routeId: vehicle.routeId,
          directionId: vehicle.directionId,
          stopId: vehicle.stopId,
          label: vehicle.label,
          currentStatus: vehicle.currentStatus,
          routeCoords: coords,
          targetIdx: newTargetIdx,
          currentIdx: newTargetIdx,
          speed: MIN_SPEED,
          lastUpdateTime: now,
          lastTargetIdx: newTargetIdx,
          lastTargetTime: now,
        });
      }
    }

    for (const [id] of states) {
      if (!seen.has(id)) states.delete(id);
    }
  }, [vehicles, routeShapes]);

  // Called every frame from the animation loop.
  // Advances each train continuously using dead reckoning + catchup lerp.
  function advanceTrains() {
    const now = Date.now();
    const dt = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;
    const states = trainStatesRef.current;

    for (const [, state] of states) {
      const diff = state.targetIdx - state.currentIdx;

      if (state.currentStatus === 'STOPPED_AT' && Math.abs(diff) < 1) {
        // Train is stopped and we're at the target — don't move
        state.currentIdx = state.targetIdx;
        continue;
      }

      if (Math.abs(diff) > 2) {
        // We're far from target — lerp to catch up quickly
        state.currentIdx += diff * CATCHUP_SPEED;
      } else {
        // We're near or at target — dead reckon forward at estimated speed
        // This creates the continuous movement between GPS updates
        const direction = diff >= 0 ? 1 : -1;
        const advance = state.speed * dt * direction;
        state.currentIdx += advance;

        // Don't overshoot the target by more than a reasonable amount
        // (train can drift slightly past target until next GPS corrects it)
        const maxOvershoot = state.speed * 15000; // allow up to 15s of overshoot
        if (direction > 0 && state.currentIdx > state.targetIdx + maxOvershoot) {
          state.currentIdx = state.targetIdx + maxOvershoot;
        } else if (direction < 0 && state.currentIdx < state.targetIdx - maxOvershoot) {
          state.currentIdx = state.targetIdx - maxOvershoot;
        }
      }

      // Clamp to route bounds
      state.currentIdx = Math.max(0, Math.min(state.routeCoords.length - 1, state.currentIdx));
    }
  }

  function computeInterpolatedPosition(state: TrainState): [number, number] {
    const coords = state.routeCoords;
    const headFloat = state.currentIdx;
    const floorIdx = Math.max(0, Math.min(coords.length - 2, Math.floor(headFloat)));
    const frac = headFloat - floorIdx;
    const p0 = coords[floorIdx];
    const p1 = coords[Math.min(floorIdx + 1, coords.length - 1)];
    return [
      p0[0] + (p1[0] - p0[0]) * frac,
      p0[1] + (p1[1] - p0[1]) * frac,
    ];
  }

  function getTrainLayers(onHover: (info: any) => void) {
    // Advance all trains first
    advanceTrains();

    const states = trainStatesRef.current;
    const trailData: any[] = [];
    const dotData: any[] = [];

    for (const [, state] of states) {
      const coords = state.routeCoords;
      const clampedHead = Math.max(0, Math.min(coords.length - 1, Math.round(state.currentIdx)));
      const interpPos = computeInterpolatedPosition(state);
      const progress = Math.round((state.currentIdx / Math.max(1, coords.length - 1)) * 100);

      // Trail
      const trailStart = Math.max(0, clampedHead - TRAIL_LENGTH);
      const trail = coords.slice(trailStart, clampedHead + 1);
      if (trail.length > 0) trail.push(interpPos);
      if (trail.length >= 2) {
        trailData.push({
          vehicleId: state.vehicleId, routeId: state.routeId,
          directionId: state.directionId, stopId: state.stopId,
          label: state.label, currentStatus: state.currentStatus,
          trail, progress,
        });
      }

      dotData.push({
        vehicleId: state.vehicleId, routeId: state.routeId,
        directionId: state.directionId, stopId: state.stopId,
        label: state.label, currentStatus: state.currentStatus,
        position: interpPos, progress,
      });
    }

    // Bright trail
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

    // Glow halo
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

    // Bright head dot
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

  return { trainStatesRef, getTrainLayers };
}
