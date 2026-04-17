import { useEffect, useState } from 'react';

const KEY = 'bostonlive.transit.hint.dismissed.v1';

export function InteractionHint() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    if (dismissed) return;

    const dismiss = () => {
      if (fadingOut) return;
      setFadingOut(true);
      try {
        localStorage.setItem(KEY, '1');
      } catch {}
      window.setTimeout(() => setDismissed(true), 500);
    };

    // Auto-dismiss after 5s OR on ANY interaction (mousemove counts — any user
    // who moves over the map has already "read" the hint).
    const timer = window.setTimeout(dismiss, 5000);
    const events: (keyof WindowEventMap)[] = [
      'pointerdown',
      'mousedown',
      'click',
      'keydown',
      'wheel',
      'touchstart',
      'mousemove',
    ];
    for (const ev of events) {
      window.addEventListener(ev, dismiss, { once: true, passive: true });
    }

    return () => {
      window.clearTimeout(timer);
      for (const ev of events) {
        window.removeEventListener(ev, dismiss);
      }
    };
  }, [dismissed, fadingOut]);

  if (dismissed) return null;

  return (
    <div
      className={`interaction-hint ${fadingOut ? 'interaction-hint--fade-out' : ''}`}
      aria-hidden="true"
    >
      Drag to pan · Right-click to orbit · Hover for trains
    </div>
  );
}
