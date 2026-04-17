import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StationTooltip } from '../../src/overlays/StationTooltip';
import type { Stop } from '../../src/types';

function mkStop(overrides: Partial<Stop> = {}): Stop {
  return {
    id: 'place-pktrm',
    name: 'Park Street',
    latitude: 42.3564,
    longitude: -71.0624,
    wheelchairBoarding: 1,
    routeIds: ['Red', 'Green-B'],
    ...overrides,
  };
}

/** Mirror `darkenRgb(getRouteColor(routeId), BRAND_DARKEN_FACTOR[routeId] ?? 0.7)`
 *  in the test so each assertion documents the expected RGB independently. */
function expectedChipBg(r: number, g: number, b: number, factor: number): string {
  const f = Math.min(1, Math.max(0, factor));
  const cr = Math.round(r * f);
  const cg = Math.round(g * f);
  const cb = Math.round(b * f);
  return `rgba(${cr}, ${cg}, ${cb}, 0.9)`;
}

describe('StationTooltip', () => {
  it('renders station name as a bold element and one chip per route', () => {
    render(<StationTooltip stop={mkStop()} pixel={[50, 50]} />);

    // FloatingPortal renders into document.body.
    const tooltip = document.body.querySelector('.station-tooltip');
    expect(tooltip).not.toBeNull();

    const nameEl = tooltip!.querySelector('.tooltip-line-name strong');
    expect(nameEl).not.toBeNull();
    expect(nameEl!.textContent).toBe('Park Street');

    const chips = tooltip!.querySelectorAll('.station-tooltip-line-chip');
    expect(chips.length).toBe(2);
    expect(chips[0].textContent).toBe('Red');
    expect(chips[1].textContent).toBe('Green B');
  });

  it('chip background uses darkenRgb(color, BRAND_DARKEN_FACTOR[routeId] ?? 0.7)', () => {
    render(<StationTooltip stop={mkStop()} pixel={[0, 0]} />);
    const chips = document.body.querySelectorAll(
      '.station-tooltip .station-tooltip-line-chip',
    ) as NodeListOf<HTMLElement>;

    // Red = [218, 41, 28] × 0.78 → rgba(170, 32, 22, 0.9)
    expect(chips[0].style.background).toBe(expectedChipBg(218, 41, 28, 0.78));
    // Green-B = [0, 132, 61] × 0.7 → rgba(0, 92, 43, 0.9)
    expect(chips[1].style.background).toBe(expectedChipBg(0, 132, 61, 0.7));
  });

  it('falls back to the 0.7 darken factor for an unknown routeId', () => {
    // Unknown route → getRouteColor returns [128, 128, 128] and
    // BRAND_DARKEN_FACTOR[routeId] is undefined → default 0.7 applies.
    render(<StationTooltip stop={mkStop({ routeIds: ['Mystery'] })} pixel={[0, 0]} />);
    const chip = document.body.querySelector(
      '.station-tooltip .station-tooltip-line-chip',
    ) as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.style.background).toBe(expectedChipBg(128, 128, 128, 0.7));
  });

  it('renders the name but no chip row when routeIds is empty', () => {
    render(<StationTooltip stop={mkStop({ routeIds: [] })} pixel={[0, 0]} />);
    const tooltip = document.body.querySelector('.station-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip!.querySelector('.tooltip-line-name strong')!.textContent).toBe('Park Street');
    expect(tooltip!.querySelector('.station-tooltip-lines')).toBeNull();
    expect(tooltip!.querySelectorAll('.station-tooltip-line-chip').length).toBe(0);
  });

  it('has role="tooltip"', () => {
    render(<StationTooltip stop={mkStop()} pixel={[0, 0]} />);
    const tooltip = document.body.querySelector('.station-tooltip');
    expect(tooltip!.getAttribute('role')).toBe('tooltip');
  });
});
