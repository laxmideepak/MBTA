import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeatherIndicator } from '../../src/components/WeatherIndicator';

describe('WeatherIndicator', () => {
  it('returns null when weather is null', () => {
    const { container } = render(<WeatherIndicator weather={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null for non-storm conditions', () => {
    const { container } = render(<WeatherIndicator weather={{ temperature: 72, condition: 'Sunny', icon: '' }} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders for storm conditions', () => {
    render(<WeatherIndicator weather={{ temperature: 45, condition: 'Thunderstorm', icon: '' }} />);
    expect(screen.getByText(/Thunderstorm/)).toBeDefined();
  });

  it('renders for rain conditions', () => {
    render(<WeatherIndicator weather={{ temperature: 50, condition: 'Heavy Rain', icon: '' }} />);
    expect(screen.getByText(/Rain/)).toBeDefined();
  });
});
