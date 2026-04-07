import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertBanner } from '../../src/overlays/AlertBanner';

describe('AlertBanner', () => {
  it('returns null when no critical alerts', () => {
    const { container } = render(<AlertBanner alerts={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null for low-severity alerts', () => {
    const { container } = render(<AlertBanner alerts={[{
      id: '1', effect: 'DELAY', cause: 'UNKNOWN', header: 'Minor delay',
      description: '', severity: 3, lifecycle: 'ONGOING',
      activePeriod: [], informedEntities: [], updatedAt: '',
    }]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders critical ongoing alerts', () => {
    render(<AlertBanner alerts={[{
      id: '1', effect: 'SHUTTLE', cause: 'MAINTENANCE',
      header: 'Red Line shuttle buses replacing service',
      description: '', severity: 7, lifecycle: 'ONGOING',
      activePeriod: [], informedEntities: [], updatedAt: '',
    }]} />);
    expect(screen.getByText(/Red Line shuttle/)).toBeDefined();
  });
});
