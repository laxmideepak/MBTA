import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrainTooltip } from '../../src/overlays/TrainTooltip';

describe('TrainTooltip', () => {
  const defaultProps = {
    x: 100, y: 100,
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

  it('renders predictions when provided', () => {
    const predictions = [{
      id: 'p1', routeId: 'Red', stopId: 'place-pktrm', directionId: 0,
      arrivalTime: new Date(Date.now() + 180000).toISOString(),
      departureTime: null, status: null, tripId: 't1', vehicleId: 'v1', stopSequence: 1,
    }];
    render(<TrainTooltip {...defaultProps} predictions={predictions} />);
    expect(screen.getByText('Future Stops')).toBeDefined();
  });
});
