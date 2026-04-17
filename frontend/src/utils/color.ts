/**
 * Color helpers for darkening MBTA brand hues on the cream basemap.
 *
 * The reference map (londonunderground.live) darkens its brand colors so the
 * moving trains read as warm saturated dots on the pale base rather than
 * fighting the UI as neon primaries. We apply the same treatment per-route
 * because MBTA's Red is already darker than TfL's Central red — a uniform
 * ×0.7 would push it into muddy brown that no longer reads as "Red Line".
 */

/**
 * Multiply every channel of an RGB triple by `factor`, rounded to integers.
 *
 * - Channels are clamped to `[0, 255]` BEFORE multiplication so callers can't
 *   pass out-of-range values and get nonsense. (e.g. a bugged upstream could
 *   hand us `-10` or `300`; we quietly saturate.)
 * - `factor` is clamped to `[0, 1]`. `1` returns the input unchanged (after
 *   clamping), `0` returns black. Values above 1 would *brighten* rather than
 *   darken — which breaks the function contract and is almost certainly a
 *   bug — so we clamp instead of silently amplifying.
 */
export function darkenRgb(rgb: [number, number, number], factor: number): [number, number, number] {
  const f = Math.min(1, Math.max(0, factor));
  const clamp = (c: number) => Math.min(255, Math.max(0, c));
  const r = Math.round(clamp(rgb[0]) * f);
  const g = Math.round(clamp(rgb[1]) * f);
  const b = Math.round(clamp(rgb[2]) * f);
  return [r, g, b];
}

/**
 * Per-route darken factor keyed by MBTA routeId. Callers use `?? 0.7` so new
 * routes (or routeIds we don't recognize) fall back to the standard factor.
 */
export const BRAND_DARKEN_FACTOR: Record<string, number> = {
  // MBTA Red is already darker than TfL Central red; 0.78 preserves recognizability on cream.
  Red: 0.78,
  // Slight extra desaturation to keep Orange distinguishable from the amber delay marker.
  Orange: 0.72,
  // Standard 0.7 reads cleanly on cream.
  Blue: 0.7,
  // Green branches all share the same brand hex; use the standard 0.7 for every branch.
  'Green-B': 0.7,
  'Green-C': 0.7,
  'Green-D': 0.7,
  'Green-E': 0.7,
  // Mattapan uses the Red-Line hex per MBTA branding, but the route is sparse enough
  // that the standard 0.7 reads fine; bump if it ever looks muddy.
  Mattapan: 0.7,
};

/**
 * Delayed trains flip to amber (`[255, 199, 44]`) before darkening. Amber is
 * already warm/low-luminance, so we darken less aggressively than the brand
 * colors to keep the delay marker visibly distinct from Orange Line trains.
 */
export const AMBER_DARKEN = 0.8;
