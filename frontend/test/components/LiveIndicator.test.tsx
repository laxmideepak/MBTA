import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveIndicator } from '../../src/components/LiveIndicator';

describe('LiveIndicator', () => {
  it('shows LIVE text', () => {
    render(<LiveIndicator connected={true} />);
    expect(screen.getByText('LIVE')).toBeDefined();
  });

  it('renders when disconnected', () => {
    render(<LiveIndicator connected={false} />);
    expect(screen.getByText('LIVE')).toBeDefined();
  });
});
