import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AlertBanner } from '../../src/overlays/AlertBanner';
import type { Alert } from '../../src/types';

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: '1',
    effect: 'SHUTTLE',
    cause: 'MAINTENANCE',
    header: 'Red Line shuttle buses replacing service',
    shortHeader: 'Red Line shuttle',
    serviceEffect: 'Red Line shuttle',
    timeframe: null,
    banner: null,
    description: '',
    severity: 7,
    lifecycle: 'ONGOING',
    url: null,
    activePeriod: [],
    informedEntities: [
      { routeId: 'Red', stopId: null, directionId: null, routeType: 1, activities: [] },
    ],
    createdAt: null,
    updatedAt: '',
    ...overrides,
  };
}

describe('AlertBanner', () => {
  it('returns null when no alerts', () => {
    const { container } = render(<AlertBanner alerts={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders passed alerts using service_effect as primary label', () => {
    render(<AlertBanner alerts={[makeAlert()]} />);
    expect(screen.getByText('Red Line shuttle')).toBeDefined();
  });

  it('drops CLOSED alerts', () => {
    const { container } = render(<AlertBanner alerts={[makeAlert({ lifecycle: 'CLOSED' })]} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows banner-flagged low-severity alerts (MBTA "front-and-center")', () => {
    render(
      <AlertBanner
        alerts={[
          makeAlert({
            severity: 2,
            lifecycle: 'NEW',
            banner: 'Shuttle buses between Harvard and Andrew.',
            serviceEffect: 'Red Line shuttle',
          }),
        ]}
      />,
    );
    expect(screen.getByText('Red Line shuttle')).toBeDefined();
    expect(screen.getByText('NEW')).toBeDefined();
  });

  it('renders timeframe when provided', () => {
    render(
      <AlertBanner
        alerts={[
          makeAlert({
            timeframe: 'Starting Wednesday',
            lifecycle: 'UPCOMING',
            activePeriod: [{ start: new Date(Date.now() + 3_600_000).toISOString(), end: null }],
          }),
        ]}
      />,
    );
    expect(screen.getByText('Starting Wednesday')).toBeDefined();
    expect(screen.getByText('UPCOMING')).toBeDefined();
  });
});
