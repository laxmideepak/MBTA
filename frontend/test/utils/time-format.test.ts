import { describe, expect, it } from 'vitest';
import {
  formatClockTime,
  formatMinutesUntil,
  formatScheduledStatus,
  formatStatus,
  formatStatusParts,
  formatStatusWithClock,
  minutesUntil,
} from '../../src/utils/time-format';

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

  it('returns "Arriving" for exactly 0 seconds away', () => {
    const now = new Date('2026-04-07T12:00:00-04:00');
    expect(formatMinutesUntil(now.toISOString(), now)).toBe('Arriving');
  });

  it('returns "1 min" for 90 seconds away', () => {
    const now = new Date('2026-04-07T12:00:00-04:00');
    const arrival = new Date('2026-04-07T12:01:30-04:00');
    expect(formatMinutesUntil(arrival.toISOString(), now)).toBe('1 min');
  });
});

describe('formatStatus (PRD §11.2)', () => {
  it('returns non-"On Time" status verbatim', () => {
    expect(formatStatus(null, 'Delayed')).toBe('Delayed');
  });

  it('returns "" when no arrival and no meaningful status', () => {
    expect(formatStatus(null, null)).toBe('');
  });

  it('returns "Boarding" for <30s away', () => {
    const now = new Date('2026-04-06T12:00:00-04:00');
    const arrival = new Date('2026-04-06T12:00:20-04:00');
    expect(formatStatus(arrival.toISOString(), null, now)).toBe('Boarding');
  });

  it('returns "Arriving" for 30–90s away', () => {
    const now = new Date('2026-04-06T12:00:00-04:00');
    const arrival = new Date('2026-04-06T12:01:00-04:00');
    expect(formatStatus(arrival.toISOString(), null, now)).toBe('Arriving');
  });

  it('returns "X min" for >90s away', () => {
    const now = new Date('2026-04-06T12:00:00-04:00');
    const arrival = new Date('2026-04-06T12:05:00-04:00');
    expect(formatStatus(arrival.toISOString(), null, now)).toBe('5 min');
  });

  it('returns "Departed" for far past', () => {
    const now = new Date('2026-04-06T12:05:00-04:00');
    const arrival = new Date('2026-04-06T12:00:00-04:00');
    expect(formatStatus(arrival.toISOString(), null, now)).toBe('Departed');
  });
});

describe('minutesUntil', () => {
  it('rounds minutes correctly', () => {
    const now = new Date('2026-04-06T12:00:00-04:00');
    const arrival = new Date('2026-04-06T12:02:30-04:00');
    expect(minutesUntil(arrival.toISOString(), now)).toBe(3);
  });
});

describe('formatClockTime (Boston-local, no AM/PM suffix)', () => {
  it('renders a Boston-local h:mm string without AM/PM', () => {
    // 19:02 UTC on DST (UTC-4) == 15:02 ET → "3:02" in 12-hour form.
    const iso = '2026-04-06T19:02:00Z';
    expect(formatClockTime(iso)).toBe('3:02');
  });

  it('renders morning times with a single-digit hour', () => {
    // 11:05 UTC on DST == 07:05 ET → "7:05".
    const iso = '2026-04-06T11:05:00Z';
    expect(formatClockTime(iso)).toBe('7:05');
  });

  it('always follows the New_York timezone, regardless of host TZ', () => {
    // Midnight ET crosses the UTC day boundary; the host machine could be
    // anywhere. We assert on the zoned output explicitly.
    const iso = '2026-04-07T04:15:00Z'; // 00:15 ET
    expect(formatClockTime(iso)).toBe('12:15');
  });
});

describe('formatStatusParts (separately-styled countdown + clock)', () => {
  it('returns countdown + clock for a future arrival', () => {
    // "7:00" boston-local now, arrival 3 min later.
    const now = new Date('2026-04-06T11:00:00Z');
    const arrival = new Date('2026-04-06T11:03:00Z');
    expect(formatStatusParts(arrival.toISOString(), null, now)).toEqual({
      label: '3 min',
      clock: '7:03',
    });
  });

  it('drops the clock for Departed (past) rows', () => {
    const now = new Date('2026-04-06T12:05:00Z');
    const arrival = new Date('2026-04-06T12:00:00Z');
    expect(formatStatusParts(arrival.toISOString(), null, now)).toEqual({
      label: 'Departed',
      clock: null,
    });
  });

  it('drops the clock when there is no arrival ETA', () => {
    expect(formatStatusParts(null, null)).toEqual({ label: '', clock: null });
  });

  it('keeps the clock for "Arriving" (30–90s) rows', () => {
    const now = new Date('2026-04-06T11:00:00Z');
    const arrival = new Date('2026-04-06T11:01:00Z');
    expect(formatStatusParts(arrival.toISOString(), null, now)).toEqual({
      label: 'Arriving',
      clock: '7:01',
    });
  });

  it('keeps the clock for "Boarding" (<30s) rows', () => {
    const now = new Date('2026-04-06T11:00:00Z');
    const arrival = new Date('2026-04-06T11:00:15Z');
    expect(formatStatusParts(arrival.toISOString(), null, now)).toEqual({
      label: 'Boarding',
      clock: '7:00',
    });
  });
});

describe('formatStatusWithClock (single-string convenience)', () => {
  it('joins countdown + clock with a paren', () => {
    const now = new Date('2026-04-06T11:00:00Z');
    const arrival = new Date('2026-04-06T11:03:00Z');
    expect(formatStatusWithClock(arrival.toISOString(), null, now)).toBe('3 min (7:03)');
  });

  it('omits the paren group for Departed rows', () => {
    const now = new Date('2026-04-06T12:05:00Z');
    const arrival = new Date('2026-04-06T12:00:00Z');
    expect(formatStatusWithClock(arrival.toISOString(), null, now)).toBe('Departed');
  });
});

describe('formatScheduledStatus', () => {
  it('shows a countdown within the next hour', () => {
    const now = new Date('2026-04-06T12:00:00-04:00');
    const arrival = new Date('2026-04-06T12:05:00-04:00');
    expect(formatScheduledStatus(arrival.toISOString(), now)).toBe('5 min');
  });

  it('clamps sub-minute arrivals to "1 min" (no "Boarding" — it is scheduled, not predicted)', () => {
    const now = new Date('2026-04-06T12:00:00-04:00');
    const arrival = new Date('2026-04-06T12:00:20-04:00');
    expect(formatScheduledStatus(arrival.toISOString(), now)).toBe('1 min');
  });

  it('switches to a clock time beyond an hour out', () => {
    const now = new Date('2026-04-06T12:00:00-04:00');
    const arrival = new Date('2026-04-06T14:17:00-04:00');
    const out = formatScheduledStatus(arrival.toISOString(), now);
    // locale-dependent formatting — assert the key bits only.
    expect(out).toMatch(/2:17/);
    expect(out).toMatch(/PM/i);
  });
});
