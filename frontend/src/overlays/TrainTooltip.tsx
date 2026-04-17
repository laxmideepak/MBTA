import { FloatingPortal, flip, offset, shift, useFloating } from '@floating-ui/react';
import { type FC, useLayoutEffect, useMemo } from 'react';
import type { Prediction } from '../types';
import { getRouteColorHex, getRouteDisplayName } from '../utils/mbta-colors';
import { DIRECTION_NAMES } from '../utils/mbta-routes';
import { getStopName } from '../utils/stop-names';
import { formatStatusParts } from '../utils/time-format';
import '../styles/tooltip.css';

interface TrainTooltipProps {
  x: number;
  y: number;
  routeId: string;
  directionId: number;
  stopId: string;
  label?: string;
  currentStatus?: string;
  delayed?: boolean;
  /** Trip-scoped predictions (already filtered to this train's trip). */
  predictions: Prediction[];
  progress: number;
  origin?: string;
  destination?: string;
  futureStops?: { stopId: string; name: string; time: string | null; status: string | null }[];
  /** Pinned tooltips stay open on mouseleave and show a close affordance. */
  pinned?: boolean;
  /** Called when the user clicks the close button on a pinned tooltip. */
  onClose?: () => void;
}

// Human phrasing for the tiny "what is it doing right now" banner. We used
// to say just "→ Alewife" which made every hover look identical regardless
// of whether the train was idling at a platform, rolling in, or en-route.
function statusPhrase(status: string | undefined, nextStop: string): string {
  switch (status) {
    case 'STOPPED_AT':
      return `Stopped at ${nextStop}`;
    case 'INCOMING_AT':
      return `Arriving at ${nextStop}`;
    case 'IN_TRANSIT_TO':
      return `Heading to ${nextStop}`;
    default:
      return nextStop ? `Next · ${nextStop}` : '';
  }
}

export const TrainTooltip: FC<TrainTooltipProps> = ({
  x,
  y,
  routeId,
  directionId,
  stopId,
  label,
  currentStatus,
  delayed,
  predictions,
  progress,
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

  const color = getRouteColorHex(routeId);
  const lineName = getRouteDisplayName(routeId);
  const headsign =
    destination && destination.length > 0
      ? destination
      : (DIRECTION_NAMES[routeId]?.[directionId] ?? `Direction ${directionId}`);
  const originName = origin && origin.length > 0 ? origin : null;
  const nextStopName = getStopName(stopId);
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const progressLabel = Number(clampedProgress.toFixed(0)).toString();

  // Trip-scoped predictions already flow in from useTrainTrips, but callers
  // may still hand us the old stopId-indexed list. Prefer the explicit
  // `futureStops` prop, fall back to filtering predictions by direction.
  const resolvedFutureStops = useMemo(() => {
    if (futureStops.length > 0) return futureStops;
    return predictions
      .filter((p) => p.directionId === directionId && p.arrivalTime)
      .sort((a, b) => new Date(a.arrivalTime!).getTime() - new Date(b.arrivalTime!).getTime())
      .slice(0, 5)
      .map((pred) => ({
        stopId: pred.stopId,
        name: getStopName(pred.stopId),
        time: pred.arrivalTime,
        status: pred.status,
      }));
  }, [futureStops, predictions, directionId]);

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

        <div className="tooltip-status-line">
          <span
            className={`tooltip-status-pulse tooltip-status-pulse--${currentStatus?.toLowerCase() ?? 'unknown'}`}
            style={{ background: color }}
            aria-hidden="true"
          />
          {statusPhrase(currentStatus, nextStopName)}
        </div>

        <div className="tooltip-progress-wrap">
          <div className="tooltip-progress">
            <div
              className="tooltip-progress-bar"
              style={{ width: `${clampedProgress}%`, background: color }}
            />
          </div>
          <span className="tooltip-progress-text">{progressLabel}%</span>
        </div>

        {resolvedFutureStops.length > 0 && (
          <div className="tooltip-stops">
            <div className="tooltip-stops-label">Next stops</div>
            {resolvedFutureStops.map((stop, idx) => {
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
