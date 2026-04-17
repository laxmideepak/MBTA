import type { RefObject } from 'react';
import { useEffect } from 'react';

/**
 * Global "/" key focuses the given input. Ignores the shortcut when the
 * user is already typing in a form field. PRD §11.
 */
export function useGlobalSlashFocus(ref: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/') return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }
      if (!ref.current) return;
      e.preventDefault();
      ref.current.focus();
      ref.current.select?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ref]);
}
