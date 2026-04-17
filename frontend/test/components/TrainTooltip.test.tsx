import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainTooltip } from '../../src/overlays/TrainTooltip';
import { useSystemStore } from '../../src/store/systemStore';
import type { NextStop, Vehicle } from '../../src/types';

// Snapshot the initial store slice so each test starts from a clean base —
// we mutate `predictions`/`serverOffsetMs` directly via setState and need to
// roll them back after each case.
const INITIAL_STORE = useSystemStore.getState();

function mkVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'v1',
    routeId: 'Red',
    latitude: 42.3555,
    longitude: -71.0565,
    bearing: 0,
    currentStatus: 'IN_TRANSIT_TO',
    stopId: 'place-pktrm',
    currentStopSequence: 1,
    directionId: 0,
    label: '1234',
    tripId: 'trip-1',
    updatedAt: '2026-04-17T12:00:00Z',
    currentStopName: 'Park St',
    lastDepartedStopId: 'place-a',
    lastDepartedAt: 1000,
    ...overrides,
  };
}

function mkNextStop(overrides: Partial<NextStop> = {}): NextStop {
  return {
    stopId: 'place-dwnxg',
    stopName: 'Downtown Crossing',
    etaSec: 120,
    status: null,
    ...overrides,
  };
}

// Instrument rAF so we can step frames deterministically.
type FrameCb = (ts: number) => void;
let nextHandle = 1;
const pending = new Map<number, FrameCb>();
const cancelSpy = vi.fn<[number], void>();

beforeEach(() => {
  nextHandle = 1;
  pending.clear();
  cancelSpy.mockClear();
  // Seed server offset so useServerNow returns a non-null value.
  useSystemStore.setState({ serverOffsetMs: 0, predictions: {} });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameCb) => {
    const id = nextHandle++;
    pending.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    cancelSpy(id);
    pending.delete(id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useSystemStore.setState({
    serverOffsetMs: INITIAL_STORE.serverOffsetMs,
    predictions: INITIAL_STORE.predictions,
  });
});

function fireFrame(ts: number): void {
  const entries = Array.from(pending.entries());
  pending.clear();
  act(() => {
    for (const [, cb] of entries) cb(ts);
  });
}

/** Vehicle primed with a `nextStops` that segmentProgress can interpolate
 *  against. `updatedAt` is pinned so the `updatedAt + etaSec*1000` fallback
 *  path lands at a predictable absolute arrival time. */
function vehicleOnSegment(overrides: Partial<Vehicle> = {}): Vehicle {
  return mkVehicle({
    lastDepartedStopId: 'place-a',
    lastDepartedAt: 1_000_000,
    nextStops: [mkNextStop({ etaSec: 60 })],
    updatedAt: new Date(1_000_000).toISOString(),
    ...overrides,
  });
}

describe('TrainTooltip', () => {
  it('renders line name and direction', () => {
    render(<TrainTooltip x={100} y={100} vehicle={mkVehicle()} />);
    expect(screen.getByText('Red Line')).toBeDefined();
  });

  it('handles unknown route gracefully', () => {
    render(<TrainTooltip x={100} y={100} vehicle={mkVehicle({ routeId: 'Unknown' })} />);
    expect(screen.getByText('Unknown')).toBeDefined();
  });

  it('renders the origin → destination journey row', () => {
    render(
      <TrainTooltip x={100} y={100} vehicle={mkVehicle()} origin="Alewife" destination="Ashmont" />,
    );
    expect(screen.getByText('FROM')).toBeDefined();
    expect(screen.getByText('TO')).toBeDefined();
    expect(screen.getByText('Alewife')).toBeDefined();
    expect(screen.getByText('Ashmont')).toBeDefined();
  });

  it('falls back to an em-dash when origin is unknown', () => {
    render(<TrainTooltip x={100} y={100} vehicle={mkVehicle()} destination="Ashmont" />);
    expect(screen.getByText('—')).toBeDefined();
  });

  it('advances the progress-bar width across frames', () => {
    // Drive the REAL segmentProgress through the tooltip's wiring: Vehicle
    // with lastDepartedAt + nextStops, server offset 0, and a fake-timer
    // "now" that we advance between frames. This proves the tooltip feeds
    // frameTs/predictionLookup/vehicle through correctly — the math itself
    // is covered by segment-progress.test.ts.
    //
    // Segment window: [1_000_000, 1_060_000] ms (60s, from updatedAt + etaSec).
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(1_012_000)); // 20% of the way
      render(<TrainTooltip x={0} y={0} vehicle={vehicleOnSegment()} />);

      // FloatingPortal renders into document.body, not the test container.
      let bar = document.body.querySelector('.tooltip-progress-bar') as HTMLElement | null;
      expect(bar).not.toBeNull();
      expect(bar!.style.width).toBe('20%');

      // Advance wall clock to 60% and fire a frame — the rAF callback bumps
      // forceRender, the component re-renders, and segmentProgress re-reads
      // Date.now() to produce the new fraction.
      vi.setSystemTime(new Date(1_036_000));
      fireFrame(16);
      bar = document.body.querySelector('.tooltip-progress-bar') as HTMLElement | null;
      expect(bar!.style.width).toBe('60%');

      vi.setSystemTime(new Date(1_054_000));
      fireFrame(32);
      bar = document.body.querySelector('.tooltip-progress-bar') as HTMLElement | null;
      expect(bar!.style.width).toBe('90%');
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the animation frame on unmount', () => {
    const { unmount } = render(<TrainTooltip x={0} y={0} vehicle={mkVehicle()} />);
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('renders "Heading to" and NO progress bar when fraction is null', () => {
    // No lastDepartedAt → segmentProgress falls through to the
    // `fraction: null, fromStopName: null, toStopName: nextStop.stopName`
    // branch. The tooltip should hide the bar and show "Heading to …".
    const vehicle = mkVehicle({
      lastDepartedAt: null,
      lastDepartedStopId: null,
      nextStops: [mkNextStop({ stopName: 'Downtown Crossing' })],
    });
    render(<TrainTooltip x={0} y={0} vehicle={vehicle} />);
    expect(document.body.querySelector('.tooltip-progress-bar')).toBeNull();
    expect(screen.getByText(/Heading to/)).toBeDefined();
    expect(screen.getByText('Downtown Crossing')).toBeDefined();
  });

  it('renders each next-stop row with a clock time in parentheses', () => {
    // Freeze "now" so formatStatusParts inside the tooltip sees a stable
    // 3-minute gap and produces "3 min (7:03)".
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-06T11:00:00Z')); // 7:00 Boston
    try {
      render(
        <TrainTooltip
          x={100}
          y={100}
          vehicle={mkVehicle()}
          futureStops={[
            {
              stopId: 'place-dwnxg',
              name: 'Downtown Crossing',
              time: '2026-04-06T11:03:00Z', // 7:03 Boston
              status: null,
            },
          ]}
        />,
      );
      expect(screen.getByText('3 min')).toBeDefined();
      expect(screen.getByText(/\(7:03\)/)).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
