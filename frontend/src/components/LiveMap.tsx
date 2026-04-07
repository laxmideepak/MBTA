import { useEffect, useRef, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { AlertBanner } from '../overlays/AlertBanner';
import { TrainTooltip } from '../overlays/TrainTooltip';
import { useRouteData } from '../hooks/useRouteData';
import { useTrainAnimation } from '../hooks/useTrainAnimation';
import { useMapLayers } from '../hooks/useMapLayers';
import type { Vehicle, Prediction, Alert, FacilityWithStatus } from '../types';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_API_KEY ?? '';
const MAP_STYLE = `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}`;

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

  const [hoverInfo, setHoverInfo] = useState<{
    x: number; y: number;
    routeId: string; directionId: number; stopId: string; progress: number;
  } | null>(null);

  const { routeShapes, stops } = useRouteData();

  const brokenStopIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of facilities) {
      if (f.status?.status === 'OUT_OF_ORDER') ids.add(f.facility.stopId);
    }
    return ids;
  }, [facilities]);

  const { getTrainLayers } = useTrainAnimation(vehicles, routeShapes);
  const staticLayersRef = useMapLayers(routeShapes, stops, accessibilityOn, brokenStopIds);

  // Initialize map once
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: [-71.0565, 42.3555],
      zoom: 13, pitch: 50, bearing: 0,
      antialias: true, dragRotate: true,
      maxPitch: 85, maxZoom: 20,
    });

    map.addControl(new maplibregl.NavigationControl());
    mapRef.current = map;

    map.on('load', () => {
      const overlay = new MapboxOverlay({ layers: [] });
      map.addControl(overlay as any);
      overlayRef.current = overlay;

      const onHover = ({ object, x, y }: any) => {
        if (object) {
          setHoverInfo({ x, y, routeId: object.routeId, directionId: object.directionId, stopId: object.stopId, progress: object.progress });
        } else {
          setHoverInfo(null);
        }
      };

      const animate = () => {
        if (!overlayRef.current) return;
        overlayRef.current.setProps({
          layers: [...staticLayersRef.current, ...getTrainLayers(onHover)],
        });
        requestAnimationFrame(animate);
      };

      animate();
    });

    return () => { map.remove(); mapRef.current = null; overlayRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
