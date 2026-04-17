import { FloatingPortal, flip, offset, shift, useFloating } from '@floating-ui/react';
import { type FC, useCallback, useLayoutEffect, useMemo, useReducer } from 'react';
import { useAnimationFrame } from '../hooks/useAnimationFrame';
import { useSystemStore } from '../store/systemStore';
import type { Prediction, Vehicle } from '../types';
import { getRouteColorHex, getRouteDisplayName } from '../utils/mbta-colors';
import { DIRECTION_NAMES } from '../utils/mbta-routes';
import { segmentProgress } from '../utils/segment-progress';
import { getStopName } from '../utils/stop-names';
import { formatStatusParts } from '../utils/time-format';
import '../styles/tooltip.css';

interface ProgressBarProps {
  fraction: number;
  fromStopName: string;
  toStopName: string;
  color: string;
}

/**
 * The segment + animated progress bar + percent readout. Extracted so the
 * fraction-derived pct/width math only runs when the bar is actually rendered
 * (not on every `showHeadingTo` / no-bar render).
 */
const ProgressBar: FC<ProgressBarProps> = ({ fraction, fromStopName, toStopName, color }) => {
  // Kept defensive even though `showBar` already clamps `fraction != null`.
  const fractionPct = Math.round(fraction * 1000) / 10;
  const fractionWidth = `${Math.min(100, Math.max(0, fraction * 100))}%`;
  return (
    <>
      <div className="tooltip-segment">
        <strong>{fromStopName}</strong>
        <span className="tooltip-segment-arrow" aria-hidden="true">
          {' → '}
        </span>
        <strong>{toStopName}</strong>
      </div>
      <div className="tooltip-progress-wrap">
        <div className="tooltip-progress">
          <div
            className="tooltip-progress-bar"
            style={{ width: fractionWidth, background: color }}
          />
        </div>
        <span className="tooltip-progress-text">{fractionPct.toFixed(1)}%</span>
      </div>
    </>
  );
};

interface TrainTooltipProps {
  x: number;
  y: number;
  /**
   * The live Vehicle this tooltip is attached to. Holds every field the
   * station-to-station progress computation needs (`lastDepartedStopId`,
   * `lastDepartedAt`, `nextStops`, `currentStatus`, etc).
   */
  vehicle: Vehicle;
  origin?: string;
  destination?: string;
  futureStops?: { stopId: string; name: string; time: string | null; status: string | null }[];
  /** Pinned tooltips stay open on mouseleave and show a close affordance. */
  pinned?: boolean;
  /** Called when the user clicks the close button on a pinned tooltip. */
  onClose?: () => void;
}

export const TrainTooltip: FC<TrainTooltipProps> = ({
  x,
  y,
  vehicle,
  origin,
  destination,
  futureStops = [],
  pinned = false,
  onClose,
}) => {
  const { refs, floatingStyles, update } = useFloating({
    placement: 'right-start',
    strategy: 'fixed',
    middleware: [
      offset({ mainAxis: 12, crossAxis: -12 }),
      flip({ fallbackPlacements: ['left-start', 'bottom', 'top'] }),
      shift({ padding: 12 }),
    ],
  });

  const virtualReference = useMemo(
    () => ({
      getBoundingClientRect() {
        return DOMRect.fromRect({ x, y, width: 0, height: 0 });
      },
    }),
    [x, y],
  );

  useLayoutEffect(() => {
    refs.setPositionReference(virtualReference);
    update();
  }, [virtualReference, refs, update]);

  const { routeId, directionId, label, currentStatus, delayed } = vehicle;

  const color = getRouteColorHex(routeId);
  const lineName = getRouteDisplayName(routeId);
  const headsign =
    destination && destination.length > 0
      ? destination
      : (DIRECTION_NAMES[routeId]?.[directionId] ?? `Direction ${directionId}`);
  const originName = origin && origin.length > 0 ? origin : null;

  // Read the predictions map straight from the store. `predictionLookup` is
  // a stable closure over the `(stopId, tripId) -> Prediction` index, rebuilt
  // only when `predictions` identity changes (i.e. real WS updates).
  const predictions = useSystemStore((s) => s.predictions);
  const predictionLookup = useCallback(
    (tid: string, sid: string): Prediction | null => {
      const bucket = predictions[sid];
      if (!bucket) return null;
      return bucket.find((p) => p.tripId === tid) ?? null;
    },
    [predictions],
  );

  // Subscribe to just the offset (a primitive), so the tooltip re-renders
  // when the server clock rebaselines but not on every other store churn.
  const serverOffsetMs = useSystemStore((s) => s.serverOffsetMs);

  // Animation state. Every rAF tick bumps a counter via useReducer so
  // segmentProgress re-runs with a fresh `Date.now()` reading. A counter
  // instead of the raw timestamp guarantees a rerender each frame even if
  // Date.now() hasn't advanced a full ms (happens in fast test loops /
  // fake-timer contexts). The tuple's first slot is intentionally discarded —
  // we only consume `forceRender` and let the re-render itself re-read
  // `Date.now()` below.
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  useAnimationFrame(() => {
    forceRender();
  });
  const frameTs = serverOffsetMs == null ? null : Date.now() + serverOffsetMs;

  const progress = segmentProgress({
    vehicle,
    now: frameTs,
    stopName: (id) => (id ? getStopName(id) : null),
    prediction: predictionLookup,
  });

  // Trip-scoped future stops are always supplied by the caller (see
  // `useTrainTrips` → `LiveMap`). The old legacy fallback that rebuilt them
  // locally from `predictions[vehicle.stopId]` has been removed — every
  // production call site passes a (possibly empty) array.

  const showBar =
    progress.fraction != null && progress.fromStopName != null && progress.toStopName != null;
  const showHeadingTo = !showBar && progress.toStopName != null;

  return (
    <FloatingPortal>
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: role is always dialog|tooltip, both support aria-label */}
      <div
        ref={refs.setFloating}
        className={`train-tooltip train-tooltip--floating${pinned ? ' train-tooltip--pinned' : ''}`}
        style={floatingStyles}
        role={pinned ? 'dialog' : 'tooltip'}
        aria-label={pinned ? `${lineName} train details` : undefined}
      >
        <div className="tooltip-header">
          <span className="tooltip-color-bar" style={{ background: color }} aria-hidden="true" />
          <span className="tooltip-line-name">{lineName}</span>
          {label ? <span className="tooltip-train-num">#{label}</span> : null}
          {delayed && (
            <span className="tooltip-delay-chip" title="Service alert on this route">
              <span className="tooltip-delay-dot" aria-hidden="true" />
              DELAY
            </span>
          )}
          {pinned && onClose ? (
            <button
              type="button"
              className="tooltip-close-btn"
              onClick={onClose}
              aria-label="Close train details"
              title="Close"
            >
              ×
            </button>
          ) : null}
        </div>

        <div className="tooltip-journey">
          <span className="tooltip-journey-part tooltip-journey-from">
            <span className="tooltip-journey-label">FROM</span>
            <span className="tooltip-journey-stop">{originName ?? '—'}</span>
          </span>
          <span className="tooltip-journey-arrow" aria-hidden="true">
            →
          </span>
          <span className="tooltip-journey-part tooltip-journey-to">
            <span className="tooltip-journey-label">TO</span>
            <span className="tooltip-journey-stop tooltip-journey-destination" style={{ color }}>
              {headsign}
            </span>
          </span>
        </div>

        {showBar ? (
          <ProgressBar
            fraction={progress.fraction as number}
            fromStopName={progress.fromStopName as string}
            toStopName={progress.toStopName as string}
            color={color}
          />
        ) : showHeadingTo ? (
          <div className="tooltip-status-line">
            <span
              className={`tooltip-status-pulse tooltip-status-pulse--${currentStatus?.toLowerCase() ?? 'unknown'}`}
              style={{ background: color }}
              aria-hidden="true"
            />
            Heading to <strong>{progress.toStopName}</strong>
          </div>
        ) : null}

        {futureStops.length > 0 && (
          <div className="tooltip-stops">
            <div className="tooltip-stops-label">Next stops</div>
            {futureStops.map((stop, idx) => {
              const { label, clock } = formatStatusParts(stop.time, stop.status);
              return (
                <div
                  key={`${stop.stopId}-${stop.time ?? idx}`}
                  className={`tooltip-stop-row${idx === 0 ? ' tooltip-stop-row--next' : ''}`}
                >
                  <span className="tooltip-stop-name">{stop.name || getStopName(stop.stopId)}</span>
                  <span className="tooltip-stop-time">
                    <span className="tooltip-stop-countdown">{label}</span>
                    {clock ? <span className="tooltip-stop-clock"> ({clock})</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </FloatingPortal>
  );
};
