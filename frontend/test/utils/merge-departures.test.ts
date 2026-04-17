import { describe, expect, it } from 'vitest';
import type { Prediction, ScheduledDeparture } from '../../src/types';
import { mergeDepartures } from '../../src/utils/merge-departures';

function mkPred(overrides: Partial<Prediction> & { id: string; tripId: string }): Prediction {
  return {
    routeId: 'Red',
    stopId: '70075',
    directionId: 1,
    arrivalTime: null,
    departureTime: null,
    status: null,
    vehicleId: null,
    stopSequence: 70,
    ...overrides,
  };
}

function mkSched(
  overrides: Partial<ScheduledDeparture> & { id: string; tripId: string },
): ScheduledDeparture {
  return {
    routeId: 'Red',
    stopId: '70075',
    directionId: 1,
    arrivalTime: null,
    departureTime: null,
    stopSequence: 70,
    ...overrides,
  };
}

describe('mergeDepartures', () => {
  const now = new Date('2026-04-16T23:00:00-04:00');
  const nowMs = now.getTime();

  it('returns live predictions when no schedules are provided', () => {
    const preds: Prediction[] = [
      mkPred({ id: 'p1', arrivalTime: '2026-04-16T23:03:00-04:00', tripId: 't1' }),
      mkPred({ id: 'p2', arrivalTime: '2026-04-16T23:08:00-04:00', tripId: 't2' }),
    ];
    const rows = mergeDepartures(preds, [], nowMs);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.kind === 'live')).toBe(true);
    expect(rows[0].key).toBe('live-p1');
  });

  it('returns schedules only when no live predictions are available', () => {
    const scheds: ScheduledDeparture[] = [
      mkSched({ id: 's1', arrivalTime: '2026-04-16T23:10:00-04:00', tripId: 't1' }),
      mkSched({ id: 's2', arrivalTime: '2026-04-16T23:22:00-04:00', tripId: 't2' }),
    ];
    const rows = mergeDepartures([], scheds, nowMs);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.kind === 'scheduled')).toBe(true);
  });

  it('prefers live predictions and drops schedules with the same trip_id', () => {
    const preds: Prediction[] = [
      mkPred({ id: 'p1', arrivalTime: '2026-04-16T23:03:30-04:00', tripId: 't1' }),
    ];
    const scheds: ScheduledDeparture[] = [
      // Same trip as live — should be dropped.
      mkSched({ id: 's1', arrivalTime: '2026-04-16T23:03:00-04:00', tripId: 't1' }),
      // Different trip, later — should remain.
      mkSched({ id: 's2', arrivalTime: '2026-04-16T23:15:00-04:00', tripId: 't2' }),
    ];
    const rows = mergeDepartures(preds, scheds, nowMs);
    expect(rows.map((r) => r.key)).toEqual(['live-p1', 'sched-s2']);
  });

  it('sorts merged rows by arrival time', () => {
    const preds: Prediction[] = [
      mkPred({ id: 'p1', arrivalTime: '2026-04-16T23:12:00-04:00', tripId: 't1' }),
    ];
    const scheds: ScheduledDeparture[] = [
      mkSched({ id: 's1', arrivalTime: '2026-04-16T23:05:00-04:00', tripId: 't2' }),
      mkSched({ id: 's2', arrivalTime: '2026-04-16T23:20:00-04:00', tripId: 't3' }),
    ];
    const rows = mergeDepartures(preds, scheds, nowMs);
    expect(rows.map((r) => r.key)).toEqual(['sched-s1', 'live-p1', 'sched-s2']);
  });

  it('filters out rows older than the past-grace cutoff', () => {
    const preds: Prediction[] = [
      // 2 min in the past — dropped.
      mkPred({ id: 'p-old', arrivalTime: '2026-04-16T22:58:00-04:00', tripId: 't0' }),
    ];
    const scheds: ScheduledDeparture[] = [
      // 5 min in the past — dropped.
      mkSched({ id: 's-old', arrivalTime: '2026-04-16T22:55:00-04:00', tripId: 't1' }),
      // 2 min ahead — kept.
      mkSched({ id: 's-new', arrivalTime: '2026-04-16T23:02:00-04:00', tripId: 't2' }),
    ];
    const rows = mergeDepartures(preds, scheds, nowMs);
    expect(rows.map((r) => r.key)).toEqual(['sched-s-new']);
  });

  it('falls back to departureTime when arrivalTime is null on schedules', () => {
    const scheds: ScheduledDeparture[] = [
      mkSched({
        id: 's1',
        arrivalTime: null,
        departureTime: '2026-04-16T23:07:00-04:00',
        tripId: 't1',
      }),
    ];
    const rows = mergeDepartures([], scheds, nowMs);
    expect(rows).toHaveLength(1);
    expect(rows[0].arrivalTime).toBe('2026-04-16T23:07:00-04:00');
  });

  it('respects maxRows', () => {
    const scheds: ScheduledDeparture[] = Array.from({ length: 20 }, (_, i) =>
      mkSched({
        id: `s${i}`,
        arrivalTime: new Date(nowMs + (i + 1) * 60_000).toISOString(),
        tripId: `t${i}`,
      }),
    );
    const rows = mergeDepartures([], scheds, nowMs, { maxRows: 5 });
    expect(rows).toHaveLength(5);
  });
});
