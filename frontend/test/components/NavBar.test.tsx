import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavBar } from '../../src/components/NavBar';

describe('NavBar', () => {
  const defaultProps = {
    view: 'map' as const,
    onViewChange: vi.fn(),
    accessibilityOn: false,
    onAccessibilityToggle: vi.fn(),
    connected: true,
  };

  it('renders MAP and BOARDS tabs', () => {
    render(<NavBar {...defaultProps} />);
    expect(screen.getByText('Map')).toBeDefined();
    expect(screen.getByText('Boards')).toBeDefined();
  });

  it('calls onViewChange when tab is clicked', () => {
    const onViewChange = vi.fn();
    render(<NavBar {...defaultProps} onViewChange={onViewChange} />);
    fireEvent.click(screen.getByText('Boards'));
    expect(onViewChange).toHaveBeenCalledWith('boards');
  });

  it('calls onAccessibilityToggle when button clicked', () => {
    const onToggle = vi.fn();
    render(<NavBar {...defaultProps} onAccessibilityToggle={onToggle} />);
    fireEvent.click(screen.getByLabelText('Toggle accessibility overlay'));
    expect(onToggle).toHaveBeenCalled();
  });

  it('shows LIVE text', () => {
    render(<NavBar {...defaultProps} connected={true} />);
    expect(screen.getByText('LIVE')).toBeDefined();
  });
});
