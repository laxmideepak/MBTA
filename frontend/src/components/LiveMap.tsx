import type { Layer, PickingInfo } from '@deck.gl/core';
import { TripsLayer } from '@deck.gl/geo-layers';
import { ScatterplotLayer } from '@deck.gl/layers';
import { MapboxOverlay } from '@deck.gl/mapbox';
import maplibregl from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHoveredEntity } from '../hooks/useHoveredEntity';
import { type StationHoverInfo, useMapLayers } from '../hooks/useMapLayers';
import { useRouteData } from '../hooks/useRouteData';
import { type TrainTrip, useTrainTrips } from '../hooks/useTrainTrips';
import { StationTooltip } from '../overlays/StationTooltip';
import { TrainTooltip } from '../overlays/TrainTooltip';
import { useSystemStore } from '../store/systemStore';
import type { Alert, Prediction, Stop, Vehicle } from '../types';
import { AMBER_DARKEN, BRAND_DARKEN_FACTOR, darkenRgb } from '../utils/color';
import { createDebugWormTrip, isDebugTripsWormEnabled } from '../utils/debug-trips-worm';
import { add3DBuildingLayer, getMapStyle } from '../utils/map-style';
import { interpolateAlongPath, interpolateAlongSegment } from '../utils/trip-geometry';

const MAP_STYLE = getMapStyle();

// Visible trail length (head → tail) in seconds of simulated travel. Tuned to
// match londonunderground.live comet density on the cream basemap — 25s reads
// as a clear worm without smearing at low speeds or overlapping at high ones.
// The core trail uses a shorter length (see below) to sharpen the head.
const TRAIL_LENGTH_SECS = 25;

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

export function LiveMap({ vehicles, predictions, alerts }: LiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);

  // Unified hover state: at most one tooltip open at a time, last setter wins.
  // `pinned` guards station hovers from replacing a pinned train tooltip.
  const { hovered, setHoveredTrain, setHoveredStation, pin, unpin, pinned } = useHoveredEntity();

  // When a user taps / clicks a train the tooltip "pins" and stays open even
  // if they move the mouse away — vital for mobile (no hover) and for anyone
  // who wants to read future stops without holding the cursor perfectly still
  // over the moving icon. The hook's `pinned` flag handles station-suppression;
  // we also track *which* train id + anchor pixel to park the tooltip at.
  const [pinnedTrainId, setPinnedTrainId] = useState<string | null>(null);
  const [pinnedTrainXY, setPinnedTrainXY] = useState<{ x: number; y: number } | null>(null);
  const [bearing, setBearing] = useState(-17.7);
  const [zoom, setZoom] = useState(12.4);

  const { routeShapes, stops } = useRouteData();
  const { trips, anchorTimeSec } = useTrainTrips(
    vehicles,
    routeShapes,
    predictions,
    alerts,
    stops,
  );

  // Refs feed the rAF loop; updating them does not retrigger the loop effect.
  const tripsRef = useRef<TrainTrip[]>(trips);
  tripsRef.current = trips;
  const anchorRef = useRef(anchorTimeSec);
  anchorRef.current = anchorTimeSec;

  // Map vehicles by id so the station hover path (which sees TrainTrip objects
  // on the picking layer, not vehicles) can resolve the matching Vehicle.
  const vehiclesById = useMemo(() => {
    const m = new Map<string, Vehicle>();
    for (const v of vehicles) m.set(v.id, v);
    return m;
  }, [vehicles]);
  const vehiclesByIdRef = useRef(vehiclesById);
  vehiclesByIdRef.current = vehiclesById;

  const handleStationHover = useCallback(
    (info: StationHoverInfo | null) => {
      if (info?.object) {
        setHoveredStation(info.object as Stop, [info.x, info.y]);
      } else {
        setHoveredStation(null);
      }
    },
    [setHoveredStation],
  );

  const handleTrainHover = useCallback(
    (info: PickingInfo) => {
      if (info?.object) {
        const trip = info.object as TrainTrip;
        const vehicle = vehiclesByIdRef.current.get(trip.id);
        if (vehicle) {
          setHoveredTrain(vehicle, [info.x, info.y]);
          return;
        }
      }
      setHoveredTrain(null);
    },
    [setHoveredTrain],
  );

  const handleTrainClick = useCallback(
    (info: PickingInfo) => {
      if (!info?.object) return;
      const trip = info.object as TrainTrip;
      // Toggle: click same train to unpin, click different train to switch pin.
      setPinnedTrainId((prev) => {
        const next = prev === trip.id ? null : trip.id;
        if (next == null) {
          unpin();
        } else {
          pin();
          // Switching pin: reflect the new target in the hover slot so the
          // TrainTooltip render switch picks it up even if the cursor already
          // drifted off the icon between click and frame.
          const vehicle = vehiclesByIdRef.current.get(trip.id);
          if (vehicle) setHoveredTrain(vehicle, [info.x, info.y]);
        }
        return next;
      });
      setPinnedTrainXY({ x: info.x, y: info.y });
    },
    [pin, unpin, setHoveredTrain],
  );

  const handleTrainHoverRef = useRef(handleTrainHover);
  handleTrainHoverRef.current = handleTrainHover;
  const handleTrainClickRef = useRef(handleTrainClick);
  handleTrainClickRef.current = handleTrainClick;

  // Clicks on empty map canvas (no train) dismiss any pinned tooltip.
  const handleMapBlankClick = useCallback(() => {
    setPinnedTrainId(null);
    setPinnedTrainXY(null);
    unpin();
    setHoveredTrain(null);
  }, [unpin, setHoveredTrain]);

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
      // Couple right-click-drag rotate + pitch for london-style 3D orbit.
      dragRotate: true,
      pitchWithRotate: true,
      maxPitch: 85,
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

        // Server clock for London-style time-driven head interpolation. Read
        // per frame via getState() (not a subscription) so we don't remount
        // the rAF loop whenever the offset updates. Null when the WS is not
        // yet synced — we fall back to GPS-based interp in that case.
        const offsetMs = useSystemStore.getState().serverOffsetMs;
        const serverNowMs = offsetMs == null ? null : Date.now() + offsetMs;

        // londonunderground.live-style comet: single tapered worm from
        // soft wide glow (tail-visible) + thin crisp core (hover-pickable).
        // fadeTrail makes vTime < currentTime - trailLength render as alpha 0,
        // so the tail naturally fades to transparent — no need to stack layers.
        const trailGlow = new TripsLayer<TrainTrip>({
          id: 'trains-glow',
          data,
          getPath: (d) => d.path,
          getTimestamps: (d) => d.timestamps,
          // Brand color darkened per-route so the halo reads as a warm saturated
          // comet on cream rather than a neon primary. Alpha 96 (was 80) keeps
          // the glow visible after the luminance drop from darkening.
          getColor: (d) => {
            const base = d.delayed
              ? darkenRgb([255, 199, 44], AMBER_DARKEN)
              : darkenRgb(
                  [d.color[0], d.color[1], d.color[2]],
                  BRAND_DARKEN_FACTOR[d.routeId] ?? 0.7,
                );
            return [base[0], base[1], base[2], 96];
          },
          opacity: 1,
          widthUnits: 'pixels',
          widthMinPixels: 5,
          widthMaxPixels: 9,
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
          // Same per-route darkening as the glow so head+trail read as a
          // single object. Trail length is 10s (shorter than glow's 25s) to
          // concentrate visual weight near the head and keep it hover-pickable.
          getColor: (d) =>
            d.delayed
              ? darkenRgb([255, 199, 44], AMBER_DARKEN)
              : darkenRgb(
                  [d.color[0], d.color[1], d.color[2]],
                  BRAND_DARKEN_FACTOR[d.routeId] ?? 0.7,
                ),
          opacity: 1,
          widthUnits: 'pixels',
          widthMinPixels: 2,
          widthMaxPixels: 4,
          getWidth: 3,
          capRounded: true,
          jointRounded: true,
          trailLength: 10,
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
          getPosition: (d) => {
            if (serverNowMs != null) {
              const seg = interpolateAlongSegment(d, serverNowMs);
              if (seg) return seg;
            }
            return interpolateAlongPath(d, playbackT);
          },
          getFillColor: (d) => {
            // Darken with the same per-route factor used by the trail layers
            // so the head dot and its comet read as a single object. Outline
            // stays the dark `[11, 18, 27, 220]` below for legibility on cream.
            const base = d.delayed
              ? darkenRgb([255, 199, 44], AMBER_DARKEN)
              : darkenRgb(
                  [d.color[0], d.color[1], d.color[2]],
                  BRAND_DARKEN_FACTOR[d.routeId] ?? 0.7,
                );
            return [base[0], base[1], base[2], 235];
          },
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
          // Use `serverNowMs ?? playbackT` so deck.gl re-evaluates the head's
          // position every frame whether we're on the segment path (time-based
          // London style) or the GPS fallback.
          updateTriggers: {
            getPosition: serverNowMs ?? playbackT,
            getFillColor: colorVersion,
          },
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

  // Pinned wins over hover so a tapped tooltip stays parked while the user
  // moves the cursor to read it. Re-resolve against the live trips list so
  // the pin follows updated positions as GPS fixes come in.
  const hoveredTrainVehicle = hovered?.kind === 'train' ? hovered.vehicle : null;
  const hoveredTrainPixel = hovered?.kind === 'train' ? hovered.pixel : null;

  const activeTrip = useMemo(() => {
    if (pinnedTrainId) {
      const match = trips.find((t) => t.id === pinnedTrainId);
      if (match) return match;
      // Fall through to hover if the pinned train fell out of the feed.
    }
    if (!hoveredTrainVehicle) return null;
    return trips.find((t) => t.id === hoveredTrainVehicle.id) ?? null;
  }, [hoveredTrainVehicle, trips, pinnedTrainId]);

  const activeAnchor = useMemo(() => {
    if (pinnedTrainId && pinnedTrainXY) return pinnedTrainXY;
    if (hoveredTrainPixel) return { x: hoveredTrainPixel[0], y: hoveredTrainPixel[1] };
    return null;
  }, [pinnedTrainId, pinnedTrainXY, hoveredTrainPixel]);

  const isPinned = pinnedTrainId != null && activeTrip?.id === pinnedTrainId;

  // TrainTooltip now owns its own animation (useAnimationFrame + server clock)
  // and pulls predictions from the store, so LiveMap only needs to hand it the
  // current Vehicle. Look up by id so the tooltip follows live WS updates.
  const activeVehicle: Vehicle | null = useMemo(() => {
    if (!activeTrip) return null;
    return vehicles.find((v) => v.id === activeTrip.id) ?? null;
  }, [activeTrip, vehicles]);

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
      {activeTrip && activeAnchor && activeVehicle && (
        <TrainTooltip
          x={activeAnchor.x}
          y={activeAnchor.y}
          vehicle={activeVehicle}
          origin={activeTrip.origin}
          destination={activeTrip.destination}
          futureStops={activeTrip.futureStops}
          pinned={isPinned}
          onClose={handleMapBlankClick}
        />
      )}
      {hovered?.kind === 'station' && !pinned && !activeTrip && (
        <StationTooltip stop={hovered.stop} pixel={hovered.pixel} />
      )}
    </div>
  );
}

export default LiveMap;
