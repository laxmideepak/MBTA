import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TrainTooltip } from '../../src/overlays/TrainTooltip';

describe('TrainTooltip', () => {
  const defaultProps = {
    x: 100,
    y: 100,
    routeId: 'Red',
    directionId: 0,
    stopId: 'place-pktrm',
    predictions: [],
    progress: 50,
  };

  it('renders line name and direction', () => {
    render(<TrainTooltip {...defaultProps} />);
    expect(screen.getByText('Red Line')).toBeDefined();
  });

  it('renders progress percentage', () => {
    render(<TrainTooltip {...defaultProps} progress={75} />);
    expect(screen.getByText('75%')).toBeDefined();
  });

  it('handles unknown route gracefully', () => {
    render(<TrainTooltip {...defaultProps} routeId="Unknown" />);
    expect(screen.getByText('Unknown')).toBeDefined();
  });

  it('renders the origin → destination journey row', () => {
    render(<TrainTooltip {...defaultProps} origin="Alewife" destination="Ashmont" />);
    expect(screen.getByText('FROM')).toBeDefined();
    expect(screen.getByText('TO')).toBeDefined();
    expect(screen.getByText('Alewife')).toBeDefined();
    expect(screen.getByText('Ashmont')).toBeDefined();
  });

  it('falls back to an em-dash when origin is unknown', () => {
    render(<TrainTooltip {...defaultProps} destination="Ashmont" />);
    expect(screen.getByText('—')).toBeDefined();
  });

  it('renders predictions list under the new "Next stops" heading', () => {
    const predictions = [
      {
        id: 'p1',
        routeId: 'Red',
        stopId: 'place-pktrm',
        directionId: 0,
        arrivalTime: new Date(Date.now() + 180000).toISOString(),
        departureTime: null,
        status: null,
        tripId: 't1',
        vehicleId: 'v1',
        stopSequence: 1,
      },
    ];
    render(<TrainTooltip {...defaultProps} predictions={predictions} />);
    expect(screen.getByText('Next stops')).toBeDefined();
  });

  it('writes a human-readable status for STOPPED_AT trains', () => {
    render(<TrainTooltip {...defaultProps} currentStatus="STOPPED_AT" />);
    expect(screen.getByText(/Stopped at/i)).toBeDefined();
  });

  it('renders each next-stop row with a clock time in parentheses', () => {
    // Freeze "now" so formatStatusParts inside the tooltip sees a stable
    // 3-minute gap and produces "3 min (7:03)". vi.setSystemTime also
    // patches new Date() — whereas monkey-patching Date.now alone does
    // not propagate into the Date constructor on all engines.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-06T11:00:00Z')); // 7:00 Boston
    try {
      render(
        <TrainTooltip
          {...defaultProps}
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
      // Clock time renders as a separate, muted span so we match on
      // the parenthesised fragment rather than the full row text.
      expect(screen.getByText(/\(7:03\)/)).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
