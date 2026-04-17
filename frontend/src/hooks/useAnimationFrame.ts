import { useEffect, useRef } from 'react';

/**
 * Run `tick` on every rAF frame until the component unmounts.
 *
 * `tick` identity is *not* part of the effect's dependency list — we store it
 * in a ref and read-through. This lets consumers pass inline arrow functions
 * (the ergonomic thing) without tearing down and re-arming the rAF loop on
 * every render, which would burn frames and break any state-machine the tick
 * is advancing.
 *
 * The hook deliberately returns nothing: if you need to stop early, unmount
 * the owning component. For pause/resume semantics, build a higher-level hook
 * on top.
 */
export function useAnimationFrame(tick: (frameNow: number) => void): void {
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    let cancelled = false;
    let handle = 0;
    const loop = (ts: number): void => {
      if (cancelled) return;
      tickRef.current(ts);
      if (cancelled) return;
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
    };
  }, []);
}
