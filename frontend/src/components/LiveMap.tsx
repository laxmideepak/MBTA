import type { Layer, PickingInfo } from '@deck.gl/core';
import { TripsLayer } from '@deck.gl/geo-layers';
import { ScatterplotLayer } from '@deck.gl/layers';
import { MapboxOverlay } from '@deck.gl/mapbox';
import maplibregl from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type StationHoverInfo, useMapLayers } from '../hooks/useMapLayers';
import { useRouteData } from '../hooks/useRouteData';
import { type TrainTrip, useTrainTrips } from '../hooks/useTrainTrips';
import { StationTooltip } from '../overlays/StationTooltip';
import { TrainTooltip } from '../overlays/TrainTooltip';
import type { Alert, Prediction, Stop, Vehicle } from '../types';
import { createDebugWormTrip, isDebugTripsWormEnabled } from '../utils/debug-trips-worm';
import { add3DBuildingLayer, getMapStyle } from '../utils/map-style';
import { interpolateAlongPath } from '../utils/trip-geometry';

const MAP_STYLE = getMapStyle();

// Visible trail length (head → tail) in seconds of simulated travel.
// Matches londonunderground.live comet feel without smearing at low speeds.
const TRAIL_LENGTH_SECS = 45;

// deck.gl 9 / luma.gl 9 rewrote GPU state to WebGPU-style keys. The equivalent
// of the old `{ depthTest: false }` (from deck.gl 8) is "always pass depth, but
// don't write depth values" — layers still draw in data order and nothing below
// them in the stack gets z-occluded. Declared once so every Trips/Scatterplot
// layer in this file reuses the same object.
const NO_DEPTH_TEST = {
  depthCompare: 'always' as const,
  depthWriteEnabled: false,
};

const DEBUG_WORM_TRIP = isDebugTripsWormEnabled() ? createDebugWormTrip() : null;

interface LiveMapProps {
  vehicles: Vehicle[];
  predictions: Record<string, Prediction[]>;
  alerts: Alert[];
}

interface TrainHoverInfo {
  x: number;
  y: number;
  trip: TrainTrip;
}

export function LiveMap({ vehicles, predictions, alerts }: LiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);

  const [hoveredTrain, setHoveredTrain] = useState<TrainHoverInfo | null>(null);
  // When a user taps / clicks a train the tooltip "pins" and stays open even
  // if they move the mouse away — vital for mobile (no hover) and for anyone
  // who wants to read future stops without holding the cursor perfectly still
  // over the moving icon.
  const [pinnedTrainId, setPinnedTrainId] = useState<string | null>(null);
  const [pinnedTrainXY, setPinnedTrainXY] = useState<{ x: number; y: number } | null>(null);
  const [hoveredStation, setHoveredStation] = useState<StationHoverInfo | null>(null);
  const [hoverClockSec, setHoverClockSec] = useState(() => performance.now() / 1000);
  const [bearing, setBearing] = useState(-17.7);
  const [zoom, setZoom] = useState(12.4);

  const { routeShapes, stops } = useRouteData();
  const { trips, anchorTimeSec } = useTrainTrips(vehicles, routeShapes, predictions, alerts);

  // Refs feed the rAF loop; updating them does not retrigger the loop effect.
  const tripsRef = useRef<TrainTrip[]>(trips);
  tripsRef.current = trips;
  const anchorRef = useRef(anchorTimeSec);
  anchorRef.current = anchorTimeSec;

  const handleStationHover = useCallback((info: StationHoverInfo | null) => {
    setHoveredStation(info);
  }, []);

  const handleTrainHover = useCallback((info: PickingInfo) => {
    if (info?.object) {
      setHoveredTrain({ x: info.x, y: info.y, trip: info.object as TrainTrip });
    } else {
      setHoveredTrain(null);
    }
  }, []);

  const handleTrainClick = useCallback((info: PickingInfo) => {
    if (!info?.object) return;
    const trip = info.object as TrainTrip;
    // Toggle: click same train to unpin, click different train to switch pin.
    setPinnedTrainId((prev) => (prev === trip.id ? null : trip.id));
    setPinnedTrainXY({ x: info.x, y: info.y });
  }, []);

  const handleTrainHoverRef = useRef(handleTrainHover);
  handleTrainHoverRef.current = handleTrainHover;
  const handleTrainClickRef = useRef(handleTrainClick);
  handleTrainClickRef.current = handleTrainClick;

  // Clicks on empty map canvas (no train) dismiss any pinned tooltip.
  const handleMapBlankClick = useCallback(() => {
    setPinnedTrainId(null);
    setPinnedTrainXY(null);
  }, []);

  const staticLayersRef = useMapLayers(routeShapes, stops, handleStationHover);

  // biome-ignore lint/correctness/useExhaustiveDependencies: staticLayersRef.current is intentionally read through a ref inside the rAF loop — adding it to the deps array would remount the entire MapLibre map every time useMapLayers finishes loading shapes/stops.
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: [-71.0565, 42.3555],
      zoom: 12.4,
      pitch: 45,
      bearing: -17.7,
      antialias: true,
      dragRotate: true,
      maxPitch: 60,
      maxZoom: 18,
    });

    mapRef.current = map;

    // Custom React-driven controls (see map-controls JSX below). Keep map
    // events in sync so buttons can show disabled states and the compass
    // rose can counter-rotate with bearing. Only sync on end events: the
    // continuous `rotate`/`zoom` events fire many times per second during
    // gestures and would flood React with setState calls on top of the rAF
    // loop that's already re-rendering deck.gl layers.
    const syncBearing = () => setBearing(map.getBearing());
    const syncZoom = () => setZoom(map.getZoom());
    map.on('rotateend', syncBearing);
    map.on('zoomend', syncZoom);

    // Some OpenMapTiles vector sprites (openfreemap dark) reference icons that
    // aren't in the sprite sheet. Serve a 1x1 transparent pixel so MapLibre
    // stops spamming console warnings and never throws on `image.length`.
    map.on('styleimagemissing', (e) => {
      if (map.hasImage(e.id)) return;
      map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
    });

    // Vector tiles occasionally arrive without the `building` source-layer
    // we target for 3D extrusion — loadTile then throws "reading 'length'".
    // Swallow those tile errors so the deck.gl overlay keeps rendering.
    map.on('error', (e) => {
      if (import.meta.env.DEV) console.debug('[map error]', e?.error?.message ?? e);
    });

    map.on('load', () => {
      try {
        add3DBuildingLayer(map);
      } catch (err) {
        console.warn('[LiveMap] 3D buildings unavailable:', err);
      }

      const overlay = new MapboxOverlay({
        layers: [],
        // Default to the grab cursor so the "you can pan" affordance doesn't
        // disappear when deck.gl takes over; flip to pointer when the cursor
        // is over a pickable train/station so users know they can tap.
        getCursor: ({ isDragging, isHovering }) =>
          isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab',
      });
      // MapboxOverlay implements mapbox's IControl; maplibre's IControl signature
      // is identical at runtime but slightly diverges in types. Single cast only.
      map.addControl(overlay as unknown as maplibregl.IControl);
      overlayRef.current = overlay;

      // Centralised click routing. Reasons to run picking ourselves instead of
      // relying on each deck.gl layer's onClick:
      //   1. A small pick *radius* (8 px) lets users tap fast-moving train
      //      icons on mobile without having to hit the exact pixel.
      //   2. Layer onClick doesn't fire at all on a miss, so there's no clean
      //      hook for "blank map click = dismiss pinned tooltip".
      //   3. We get a deterministic hit-test order (icons win over trips if
      //      deck.gl's stacking ever changes).
      map.on('click', (e) => {
        const picked = overlay.pickObject({ x: e.point.x, y: e.point.y, radius: 8 });
        if (picked?.object) {
          handleTrainClickRef.current({ ...picked, x: e.point.x, y: e.point.y });
        } else {
          handleMapBlankClick();
        }
      });

      let rafId = 0;
      const animate = () => {
        if (!overlayRef.current) return;

        // TripsLayer shader keeps vTime in [currentTime - trailLength, currentTime].
        // timestamps[headIdx] === 0; currentTime starts at 0 at rebuild and grows,
        // so the head marches forward along the path between GPS rebuilds and the
        // tail fades out behind it. Timestamps are precomputed once per rebuild
        // (in useTrainTrips) and reused every frame — no per-frame allocations.
        const playbackT = performance.now() / 1000 - anchorRef.current;
        const data = tripsRef.current;
        // updateTriggers value: bumps whenever the trip set rebuilds (new GPS
        // ticks, new alerts, etc.). Re-uploads delay-aware colours only on
        // rebuild instead of diffing every vehicle's delay flag each frame.
        const colorVersion = anchorRef.current;

        // londonunderground.live-style comet: single tapered worm from
        // soft wide glow (tail-visible) + thin crisp core (hover-pickable).
        // fadeTrail makes vTime < currentTime - trailLength render as alpha 0,
        // so the tail naturally fades to transparent — no need to stack layers.
        const trailGlow = new TripsLayer<TrainTrip>({
          id: 'trains-glow',
          data,
          getPath: (d) => d.path,
          getTimestamps: (d) => d.timestamps,
          getColor: (d) => d.colorGlow,
          opacity: 1,
          widthUnits: 'pixels',
          widthMinPixels: 4,
          widthMaxPixels: 10,
          getWidth: 6,
          capRounded: true,
          jointRounded: true,
          trailLength: TRAIL_LENGTH_SECS,
          currentTime: playbackT,
          fadeTrail: true,
          pickable: false,
          parameters: NO_DEPTH_TEST,
          updateTriggers: { getColor: colorVersion },
        });

        // CRISP CORE — shorter trail = thicker-looking near the head,
        // transparent well before the glow trail ends. Handles hover picking.
        const trainsCore = new TripsLayer<TrainTrip>({
          id: 'trains',
          data,
          getPath: (d) => d.path,
          getTimestamps: (d) => d.timestamps,
          getColor: (d) => d.color,
          opacity: 1,
          widthUnits: 'pixels',
          widthMinPixels: 2,
          widthMaxPixels: 5,
          getWidth: 3,
          capRounded: true,
          jointRounded: true,
          trailLength: TRAIL_LENGTH_SECS * 0.35,
          currentTime: playbackT,
          fadeTrail: true,
          pickable: true,
          onHover: (info) => handleTrainHoverRef.current(info),
          // Click handling lives on map.on('click') above so a single tap
          // fires exactly once regardless of which pickable layer is on top.
          parameters: NO_DEPTH_TEST,
          updateTriggers: { getColor: colorVersion },
        });

        // HEAD DOT — a single small crisp circle at each train's current
        // position. Interpolated along the polyline every frame so it tracks
        // the worm's leading edge instead of freezing at the last GPS fix
        // (MBTA only emits vehicle updates every 5-20s, so a static head
        // reads as "stuck then jumping" against the smoothly-scrolling trail
        // rendered by TripsLayer above).
        //
        // The dot is the route brand colour (amber if the route has an active
        // service-disrupting alert). A thin dark outline keeps it legible
        // against the pale basemap. It's also the primary pick target for
        // tooltips — the 8px click radius on map.on('click') makes hits
        // forgiving even at high zoom.
        const trainsHead = new ScatterplotLayer<TrainTrip>({
          id: 'trains-head',
          data,
          getPosition: (d) => interpolateAlongPath(d, playbackT),
          getFillColor: (d) =>
            d.delayed ? [255, 199, 44, 235] : [d.color[0], d.color[1], d.color[2], 235],
          getLineColor: [11, 18, 27, 220],
          stroked: true,
          filled: true,
          lineWidthUnits: 'pixels',
          getLineWidth: 1.25,
          radiusUnits: 'pixels',
          getRadius: 4.5,
          radiusMinPixels: 3,
          radiusMaxPixels: 6,
          pickable: true,
          onHover: (info) => handleTrainHoverRef.current(info),
          parameters: NO_DEPTH_TEST,
          // playbackT in getPosition trigger: force per-frame re-eval of the
          // interpolated position (deck.gl otherwise skips accessor re-runs
          // when `data` keeps the same reference across frames).
          updateTriggers: { getPosition: playbackT, getFillColor: colorVersion },
        });

        const layers: Layer[] = [...staticLayersRef.current, trailGlow, trainsCore, trainsHead];

        if (DEBUG_WORM_TRIP) {
          const worm = [DEBUG_WORM_TRIP];
          layers.push(
            new TripsLayer<TrainTrip>({
              id: 'debug-worm-glow',
              data: worm,
              getPath: (d) => d.path,
              getTimestamps: (d) => d.timestamps,
              getColor: [255, 0, 255, 100],
              opacity: 1,
              widthUnits: 'pixels',
              widthMinPixels: 18,
              widthMaxPixels: 32,
              getWidth: 24,
              capRounded: true,
              jointRounded: true,
              trailLength: TRAIL_LENGTH_SECS,
              currentTime: playbackT,
              fadeTrail: true,
              pickable: false,
              parameters: NO_DEPTH_TEST,
            }),
            new TripsLayer<TrainTrip>({
              id: 'debug-worm-core',
              data: worm,
              getPath: (d) => d.path,
              getTimestamps: (d) => d.timestamps,
              getColor: [255, 0, 255, 255],
              opacity: 1,
              widthUnits: 'pixels',
              widthMinPixels: 10,
              widthMaxPixels: 18,
              getWidth: 12,
              capRounded: true,
              jointRounded: true,
              trailLength: TRAIL_LENGTH_SECS,
              currentTime: playbackT,
              fadeTrail: true,
              pickable: false,
              parameters: NO_DEPTH_TEST,
            }),
          );
        }

        overlayRef.current.setProps({ layers });
        rafId = requestAnimationFrame(animate);
      };
      animate();

      map.once('remove', () => cancelAnimationFrame(rafId));
    });

    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, [handleMapBlankClick]);

  useEffect(() => {
    if (!hoveredTrain && !pinnedTrainId) return;
    let timer = 0;
    const tick = () => {
      setHoverClockSec(performance.now() / 1000);
      timer = window.setTimeout(tick, 100);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [hoveredTrain, pinnedTrainId]);

  // Pinned wins over hover so a tapped tooltip stays parked while the user
  // moves the cursor to read it. Re-resolve against the live trips list so
  // the pin follows updated positions as GPS fixes come in.
  const activeTrip = useMemo(() => {
    if (pinnedTrainId) {
      const match = trips.find((t) => t.id === pinnedTrainId);
      if (match) return match;
      // Fall through to hover if the pinned train fell out of the feed.
    }
    if (!hoveredTrain) return null;
    return trips.find((t) => t.id === hoveredTrain.trip.id) ?? hoveredTrain.trip;
  }, [hoveredTrain, trips, pinnedTrainId]);

  const activeAnchor = useMemo(() => {
    if (pinnedTrainId && pinnedTrainXY) return pinnedTrainXY;
    if (hoveredTrain) return { x: hoveredTrain.x, y: hoveredTrain.y };
    return null;
  }, [pinnedTrainId, pinnedTrainXY, hoveredTrain]);

  const isPinned = pinnedTrainId != null && activeTrip?.id === pinnedTrainId;

  const activeStopPredictions: Prediction[] = activeTrip
    ? (predictions[activeTrip.stopId] ?? [])
    : [];

  const activeProgress = useMemo(() => {
    if (!activeTrip) return 0;
    const elapsedSec = Math.max(0, hoverClockSec - anchorTimeSec);
    const raw = (activeTrip.progress + activeTrip.progressVelocity * elapsedSec) * 100;
    return Math.max(0, Math.min(100, raw));
  }, [activeTrip, hoverClockSec, anchorTimeSec]);

  const handleZoomIn = useCallback(() => {
    mapRef.current?.zoomIn({ duration: 200 });
  }, []);
  const handleZoomOut = useCallback(() => {
    mapRef.current?.zoomOut({ duration: 200 });
  }, []);
  const handleResetNorth = useCallback(() => {
    mapRef.current?.easeTo({ bearing: 0, pitch: 45, duration: 400 });
  }, []);

  const canZoomIn = zoom < 18 - 0.001;
  const canZoomOut = zoom > 2 + 0.001;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div
        ref={mapContainerRef}
        style={{ width: '100%', height: '100%' }}
        role="application"
        aria-label="Live MBTA train map"
      />
      <div className="map-controls" role="toolbar" aria-label="Map controls">
        <div className="map-ctrl-stack">
          <button
            type="button"
            className="map-ctrl-btn map-ctrl-btn--zoom"
            onClick={handleZoomIn}
            disabled={!canZoomIn}
            aria-label="Zoom in"
            title="Zoom in"
          >
            <span aria-hidden="true">+</span>
          </button>
          <button
            type="button"
            className="map-ctrl-btn map-ctrl-btn--zoom"
            onClick={handleZoomOut}
            disabled={!canZoomOut}
            aria-label="Zoom out"
            title="Zoom out"
          >
            <span aria-hidden="true">−</span>
          </button>
        </div>
        <button
          type="button"
          className="map-ctrl-btn map-ctrl-btn--compass"
          onClick={handleResetNorth}
          aria-label={`Reset orientation, currently ${Math.round(((-bearing % 360) + 360) % 360)} degrees`}
          title="Reset orientation to north"
        >
          <span
            className="map-ctrl-compass-rose"
            style={{ transform: `rotate(${-bearing}deg)` }}
            aria-hidden="true"
          >
            <span className="map-ctrl-compass-label map-ctrl-compass-label--n">N</span>
            <span className="map-ctrl-compass-label map-ctrl-compass-label--e">E</span>
            <span className="map-ctrl-compass-label map-ctrl-compass-label--s">S</span>
            <span className="map-ctrl-compass-label map-ctrl-compass-label--w">W</span>
            <span className="map-ctrl-compass-needle" />
          </span>
        </button>
      </div>
      {activeTrip && activeAnchor && (
        <TrainTooltip
          x={activeAnchor.x}
          y={activeAnchor.y}
          routeId={activeTrip.routeId}
          directionId={activeTrip.directionId}
          stopId={activeTrip.stopId}
          label={activeTrip.label}
          currentStatus={activeTrip.currentStatus}
          delayed={activeTrip.delayed}
          predictions={activeStopPredictions}
          progress={activeProgress}
          origin={activeTrip.origin}
          destination={activeTrip.destination}
          futureStops={activeTrip.futureStops}
          pinned={isPinned}
          onClose={handleMapBlankClick}
        />
      )}
      {hoveredStation && !activeTrip && (
        <StationTooltip
          x={hoveredStation.x}
          y={hoveredStation.y}
          stop={hoveredStation.object as Stop}
        />
      )}
    </div>
  );
}

export default LiveMap;
