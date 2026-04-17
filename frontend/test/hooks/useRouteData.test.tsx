import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRouteData } from '../../src/hooks/useRouteData';

// Minimal valid response bodies matching the shapes useRouteData parses.
const shapesBody = {
  Red: [{ coordinates: [[42.36, -71.05]] }],
};
const stopsBody = {
  data: [
    {
      id: 'place-pktrm',
      attributes: { name: 'Park Street', latitude: 42.36, longitude: -71.06 },
    },
  ],
};

function mockOk(body: unknown, signal?: AbortSignal): Response {
  return {
    ok: true,
    status: 200,
    json: async () => {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      return body;
    },
  } as unknown as Response;
}

describe('useRouteData', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('populates stops and routeShapes on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes('/api/shapes')) return mockOk(shapesBody);
        if (url.includes('/api/stops')) return mockOk(stopsBody);
        throw new Error(`unexpected ${url}`);
      }),
    );

    const { result } = renderHook(() => useRouteData());
    await waitFor(() => {
      expect(result.current.stops).toHaveLength(1);
    });
    expect(result.current.stops[0].name).toBe('Park Street');
    expect(result.current.routeShapes.has('Red')).toBe(true);
  });

  it('leaves state empty when /api/shapes returns non-ok (no partial corruption)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes('/api/shapes')) return { ok: false, status: 500 } as unknown as Response;
        return mockOk(stopsBody);
      }),
    );

    const { result } = renderHook(() => useRouteData());
    // Give the effect a chance to settle — nothing should ever populate.
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.stops).toHaveLength(0);
    expect(result.current.routeShapes.size).toBe(0);
  });

  it('aborts in-flight requests on unmount and does not set state afterwards', async () => {
    const abortedCalls: boolean[] = [];
    // Resolve the fetches only after the hook has unmounted so any setState
    // would happen on a dead instance. With the AbortController wired up,
    // fetch should reject with AbortError before we reach setState.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });

    vi.stubGlobal(
      'fetch',
      vi.fn((input: unknown, init?: { signal?: AbortSignal }) => {
        return new Promise<Response>((resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener('abort', () => {
            abortedCalls.push(true);
            reject(new DOMException('aborted', 'AbortError'));
          });
          gate.then(() => {
            if (signal?.aborted) return;
            const url = String(input);
            resolve(mockOk(url.includes('/api/shapes') ? shapesBody : stopsBody, signal));
          });
        });
      }),
    );

    const { result, unmount } = renderHook(() => useRouteData());
    unmount();
    release();
    // Let any pending microtasks flush.
    await new Promise((r) => setTimeout(r, 20));

    expect(abortedCalls.length).toBeGreaterThan(0);
    expect(result.current.stops).toHaveLength(0);
    expect(result.current.routeShapes.size).toBe(0);
  });
});
