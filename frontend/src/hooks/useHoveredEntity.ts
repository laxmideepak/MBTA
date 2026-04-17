import { useCallback, useState } from 'react';
import type { Stop, Vehicle } from '../types';

/**
 * Union describing whichever single entity (if any) the user is currently
 * hovering on the map. Train hovers and station hovers are mutually exclusive
 * — only one tooltip is visible at a time — so they share one state slot
 * rather than two. Last setter wins.
 *
 * `pixel` is the map-container-relative `[x, y]` picked from deck.gl so the
 * tooltip components can anchor a floating overlay.
 */
export type HoveredEntity =
  | { kind: 'train'; vehicle: Vehicle; pixel: [number, number] }
  | { kind: 'station'; stop: Stop; pixel: [number, number] }
  | null;

export interface UseHoveredEntity {
  hovered: HoveredEntity;
  setHoveredTrain: (v: Vehicle | null, pixel?: [number, number]) => void;
  setHoveredStation: (s: Stop | null, pixel?: [number, number]) => void;
  pin: () => void;
  unpin: () => void;
  pinned: boolean;
}

/**
 * Unified hover-state manager used by `LiveMap` to dispatch hover and pick
 * events from deck.gl onto either the train tooltip or the station tooltip.
 *
 * Rules:
 *  - At most one entity visible — the last setter (train or station) wins.
 *  - Passing `null` to either setter clears the slot.
 *  - While `pinned === true`, `setHoveredStation` is a no-op so a pinned
 *    train tooltip isn't replaced when the user's cursor drifts over a
 *    nearby station. `setHoveredTrain` still works so the user can re-pin
 *    / switch pin to a different train.
 */
export function useHoveredEntity(): UseHoveredEntity {
  const [hovered, setHovered] = useState<HoveredEntity>(null);
  const [pinned, setPinned] = useState<boolean>(false);

  const setHoveredTrain = useCallback((v: Vehicle | null, pixel?: [number, number]) => {
    if (v == null) {
      setHovered(null);
      return;
    }
    setHovered({ kind: 'train', vehicle: v, pixel: pixel ?? [0, 0] });
  }, []);

  const setHoveredStation = useCallback(
    (s: Stop | null, pixel?: [number, number]) => {
      if (pinned) return;
      if (s == null) {
        setHovered(null);
        return;
      }
      setHovered({ kind: 'station', stop: s, pixel: pixel ?? [0, 0] });
    },
    [pinned],
  );

  const pin = useCallback(() => setPinned(true), []);
  const unpin = useCallback(() => setPinned(false), []);

  return { hovered, setHoveredTrain, setHoveredStation, pin, unpin, pinned };
}
