import { FloatingPortal, flip, offset, shift, useFloating } from '@floating-ui/react';
import { type FC, useLayoutEffect, useMemo } from 'react';
import type { Stop } from '../types';
import { BRAND_DARKEN_FACTOR, darkenRgb } from '../utils/color';
import { getRouteColor, getRouteDisplayName } from '../utils/mbta-colors';
import '../styles/tooltip.css';

interface StationTooltipProps {
  stop: Stop;
  /** Map-container pixel coordinate ([x, y]) from the deck.gl hover event. */
  pixel: [number, number];
}

/**
 * Short chip label per route. `getRouteDisplayName` returns the "Green Line B"
 * style — too long for a chip row. We want "Red" / "Green B" / "Mattapan".
 */
function shortRouteLabel(routeId: string): string {
  switch (routeId) {
    case 'Red':
      return 'Red';
    case 'Orange':
      return 'Orange';
    case 'Blue':
      return 'Blue';
    case 'Green-B':
      return 'Green B';
    case 'Green-C':
      return 'Green C';
    case 'Green-D':
      return 'Green D';
    case 'Green-E':
      return 'Green E';
    case 'Mattapan':
      return 'Mattapan';
    default:
      return getRouteDisplayName(routeId);
  }
}

/**
 * Chip background = `darkenRgb(routeColor, BRAND_DARKEN_FACTOR[routeId] ?? 0.7)`
 * wrapped as `rgba(..., 0.9)`. Matches the train comet's per-route darkening
 * (see `utils/color.ts`) so the station chip visually echoes the moving worm
 * of the same line.
 */
function chipBackground(routeId: string): string {
  const [r, g, b] = darkenRgb(getRouteColor(routeId), BRAND_DARKEN_FACTOR[routeId] ?? 0.7);
  return `rgba(${r}, ${g}, ${b}, 0.9)`;
}

export const StationTooltip: FC<StationTooltipProps> = ({ stop, pixel }) => {
  const routeIds = stop.routeIds ?? [];
  const [x, y] = pixel;

  // Same virtualReference / Floating UI middleware pattern as TrainTooltip so
  // the station tooltip flips/shifts identically when the hover point is near
  // the viewport edge.
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

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        className="station-tooltip station-tooltip--floating"
        style={floatingStyles}
        role="tooltip"
      >
        <div className="tooltip-header">
          <span className="tooltip-line-name">
            <strong>{stop.name}</strong>
          </span>
        </div>

        {routeIds.length > 0 && (
          <div className="station-tooltip-lines">
            {routeIds.map((routeId) => (
              <span
                key={routeId}
                className="station-tooltip-line-chip"
                style={{ background: chipBackground(routeId) }}
              >
                {shortRouteLabel(routeId)}
              </span>
            ))}
          </div>
        )}
      </div>
    </FloatingPortal>
  );
};
