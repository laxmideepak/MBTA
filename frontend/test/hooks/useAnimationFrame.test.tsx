import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnimationFrame } from '../../src/hooks/useAnimationFrame';

// Swap the global rAF/cAF for an inspectable pair so we can fire frames
// manually and assert the hook's start/stop lifecycle.
type FrameCb = (ts: number) => void;

let nextHandle = 1;
const pending = new Map<number, FrameCb>();
const cancelSpy = vi.fn<[number], void>();

beforeEach(() => {
  nextHandle = 1;
  pending.clear();
  cancelSpy.mockClear();
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
});

function fireFrame(ts: number): void {
  const entries = Array.from(pending.entries());
  pending.clear();
  for (const [, cb] of entries) cb(ts);
}

function TestComponent({ tick }: { tick: (now: number) => void }): null {
  useAnimationFrame(tick);
  return null;
}

describe('useAnimationFrame', () => {
  it('invokes the tick callback on successive rAF frames', () => {
    const tick = vi.fn();
    render(<TestComponent tick={tick} />);
    fireFrame(16);
    fireFrame(32);
    fireFrame(48);
    expect(tick).toHaveBeenCalledTimes(3);
    expect(tick).toHaveBeenNthCalledWith(1, 16);
    expect(tick).toHaveBeenNthCalledWith(3, 48);
  });

  it('cancels the pending frame on unmount', () => {
    const tick = vi.fn();
    const { unmount } = render(<TestComponent tick={tick} />);
    // At this point a frame is queued; capture its handle.
    expect(pending.size).toBeGreaterThan(0);
    const lastHandle = Math.max(...pending.keys());
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
    // The most recent queued handle should be what we cancelled.
    expect(cancelSpy.mock.calls.some(([id]) => id === lastHandle)).toBe(true);
  });
});
