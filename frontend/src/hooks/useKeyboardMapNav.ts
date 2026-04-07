import { useState, useEffect, useCallback } from 'react';
import type { Stop } from '../types';

interface UseKeyboardMapNavOptions {
  stops: Stop[];
  mapContainer: HTMLDivElement | null;
  onStationSelect: (stop: Stop) => void;
  onStationActivate: (stop: Stop, x: number, y: number) => void;
  onDismiss: () => void;
}

export function useKeyboardMapNav({
  stops,
  mapContainer,
  onStationSelect,
  onStationActivate,
  onDismiss,
}: UseKeyboardMapNavOptions) {
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // Sort stops alphabetically for predictable navigation
  const sortedStops = [...stops].sort((a, b) => a.name.localeCompare(b.name));

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (sortedStops.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight': {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev < sortedStops.length - 1 ? prev + 1 : 0;
          onStationSelect(sortedStops[next]);
          return next;
        });
        break;
      }
      case 'ArrowUp':
      case 'ArrowLeft': {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev > 0 ? prev - 1 : sortedStops.length - 1;
          onStationSelect(sortedStops[next]);
          return next;
        });
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < sortedStops.length) {
          const stop = sortedStops[focusedIndex];
          // Use center of map container as popup position
          const rect = mapContainer?.getBoundingClientRect();
          const x = rect ? rect.width / 2 : 300;
          const y = rect ? rect.height / 2 : 300;
          onStationActivate(stop, x, y);
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        onDismiss();
        setFocusedIndex(-1);
        break;
      }
    }
  }, [sortedStops, focusedIndex, mapContainer, onStationSelect, onStationActivate, onDismiss]);

  useEffect(() => {
    if (!mapContainer) return;
    mapContainer.addEventListener('keydown', handleKeyDown);
    return () => mapContainer.removeEventListener('keydown', handleKeyDown);
  }, [mapContainer, handleKeyDown]);

  return {
    focusedStop: focusedIndex >= 0 ? sortedStops[focusedIndex] : null,
    focusedIndex,
    resetFocus: () => setFocusedIndex(-1),
  };
}
