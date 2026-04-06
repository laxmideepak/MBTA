import { describe, it, expect, vi } from 'vitest';
import { formatArrival, formatMinutesUntil } from '../../src/utils/time-format';

describe('formatMinutesUntil', () => {
  it('returns "Arriving" for times less than 1 minute away', () => {
    const now = new Date('2026-04-06T12:00:00-04:00');
    const arrival = new Date('2026-04-06T12:00:30-04:00');
    expect(formatMinutesUntil(arrival.toISOString(), now)).toBe('Arriving');
  });

  it('returns "X min" for future times', () => {
    const now = new Date('2026-04-06T12:00:00-04:00');
    const arrival = new Date('2026-04-06T12:05:00-04:00');
    expect(formatMinutesUntil(arrival.toISOString(), now)).toBe('5 min');
  });

  it('returns "Departed" for past times', () => {
    const now = new Date('2026-04-06T12:05:00-04:00');
    const arrival = new Date('2026-04-06T12:00:00-04:00');
    expect(formatMinutesUntil(arrival.toISOString(), now)).toBe('Departed');
  });
});

describe('formatArrival', () => {
  it('returns status when provided', () => {
    expect(formatArrival(null, 'Arriving')).toBe('Arriving');
  });

  it('formats arrival time when no status', () => {
    const now = new Date('2026-04-06T12:00:00-04:00');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(formatArrival('2026-04-06T12:03:00-04:00', null)).toBe('3 min');
    vi.useRealTimers();
  });

  it('returns empty string when no data', () => {
    expect(formatArrival(null, null)).toBe('');
  });
});
