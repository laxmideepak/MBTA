import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Vehicle } from '../../src/types';

// Mutable mock for segmentProgress — each test overrides the next return
// value so we can stage fractions across simulated frames.
const segmentProgressQueue: Array<ReturnType<typeof buildProgress>> = [];

function buildProgress(
  overrides: Partial<{
    fraction: number | null;
    fromStopName: string | null;
    toStopName: string | null;
  }> = {},
) {
  return {
    fraction: 0,
    fromStopName: 'Park St',
    toStopName: 'Downtown Crossing',
    ...overrides,
  };
}

vi.mock('../../src/utils/segment-progress', () => ({
  segmentProgress: () => {
    if (segmentProgressQueue.length > 1) return segmentProgressQueue.shift();
    return segmentProgressQueue[0] ?? buildProgress();
  },
}));

import { TrainTooltip } from '../../src/overlays/TrainTooltip';
// Pin server clock so useServerNow inside the tooltip returns a stable value.
import { useSystemStore } from '../../src/store/systemStore';

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

// Instrument rAF so we can step frames deterministically.
type FrameCb = (ts: number) => void;
let nextHandle = 1;
const pending = new Map<number, FrameCb>();
const cancelSpy = vi.fn<[number], void>();

beforeEach(() => {
  nextHandle = 1;
  pending.clear();
  cancelSpy.mockClear();
  segmentProgressQueue.length = 0;
  // Seed server offset so useServerNow returns a non-null value.
  useSystemStore.setState({ serverOffsetMs: 0 });
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
  useSystemStore.setState({ serverOffsetMs: null });
});

function fireFrame(ts: number): void {
  const entries = Array.from(pending.entries());
  pending.clear();
  act(() => {
    for (const [, cb] of entries) cb(ts);
  });
}

describe('TrainTooltip', () => {
  it('renders line name and direction', () => {
    segmentProgressQueue.push(buildProgress({ fraction: 0.5 }));
    render(<TrainTooltip x={100} y={100} vehicle={mkVehicle()} />);
    expect(screen.getByText('Red Line')).toBeDefined();
  });

  it('handles unknown route gracefully', () => {
    segmentProgressQueue.push(buildProgress({ fraction: 0.5 }));
    render(<TrainTooltip x={100} y={100} vehicle={mkVehicle({ routeId: 'Unknown' })} />);
    expect(screen.getByText('Unknown')).toBeDefined();
  });

  it('renders the origin → destination journey row', () => {
    segmentProgressQueue.push(buildProgress({ fraction: 0.3 }));
    render(
      <TrainTooltip x={100} y={100} vehicle={mkVehicle()} origin="Alewife" destination="Ashmont" />,
    );
    expect(screen.getByText('FROM')).toBeDefined();
    expect(screen.getByText('TO')).toBeDefined();
    expect(screen.getByText('Alewife')).toBeDefined();
    expect(screen.getByText('Ashmont')).toBeDefined();
  });

  it('falls back to an em-dash when origin is unknown', () => {
    segmentProgressQueue.push(buildProgress({ fraction: 0.3 }));
    render(<TrainTooltip x={100} y={100} vehicle={mkVehicle()} destination="Ashmont" />);
    expect(screen.getByText('—')).toBeDefined();
  });

  it('advances the progress-bar width across frames', () => {
    // Initial mount uses .fraction = 0.2, then rAF ticks bump to .6, .9.
    segmentProgressQueue.push(buildProgress({ fraction: 0.2 }));
    render(<TrainTooltip x={0} y={0} vehicle={mkVehicle()} />);

    // FloatingPortal renders into document.body, not the test container.
    let bar = document.body.querySelector('.tooltip-progress-bar') as HTMLElement | null;
    expect(bar).not.toBeNull();
    expect(bar!.style.width).toBe('20%');

    // Tick a frame with a higher fraction — the next rAF callback runs
    // our mock and React re-renders with the new width.
    segmentProgressQueue.length = 0;
    segmentProgressQueue.push(buildProgress({ fraction: 0.6 }));
    fireFrame(16);
    bar = document.body.querySelector('.tooltip-progress-bar') as HTMLElement | null;
    expect(bar!.style.width).toBe('60%');

    segmentProgressQueue.length = 0;
    segmentProgressQueue.push(buildProgress({ fraction: 0.9 }));
    fireFrame(32);
    bar = document.body.querySelector('.tooltip-progress-bar') as HTMLElement | null;
    expect(bar!.style.width).toBe('90%');
  });

  it('cancels the animation frame on unmount', () => {
    segmentProgressQueue.push(buildProgress({ fraction: 0.4 }));
    const { unmount } = render(<TrainTooltip x={0} y={0} vehicle={mkVehicle()} />);
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('renders "Heading to" and NO progress bar when fraction is null', () => {
    segmentProgressQueue.push(
      buildProgress({ fraction: null, fromStopName: null, toStopName: 'Downtown Crossing' }),
    );
    render(<TrainTooltip x={0} y={0} vehicle={mkVehicle()} />);
    expect(document.body.querySelector('.tooltip-progress-bar')).toBeNull();
    expect(screen.getByText(/Heading to/)).toBeDefined();
    expect(screen.getByText('Downtown Crossing')).toBeDefined();
  });

  it('renders each next-stop row with a clock time in parentheses', () => {
    // Freeze "now" so formatStatusParts inside the tooltip sees a stable
    // 3-minute gap and produces "3 min (7:03)".
    segmentProgressQueue.push(buildProgress({ fraction: 0.5 }));
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
