import { type FC } from 'react';
import { LiveIndicator } from './LiveIndicator';
import type { ViewMode } from '../types';
import '../styles/nav.css';

interface NavBarProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  accessibilityOn: boolean;
  onAccessibilityToggle: () => void;
  connected: boolean;
}

export const NavBar: FC<NavBarProps> = ({ view, onViewChange, accessibilityOn, onAccessibilityToggle, connected }) => (
  <nav className="nav-bar">
    <div className="nav-left">
      <span className="nav-title">BOSTON SUBWAY</span>
      <LiveIndicator connected={connected} />
    </div>
    <div className="nav-tabs">
      <button className={`nav-tab ${view === 'map' ? 'active' : ''}`} onClick={() => onViewChange('map')}>Map</button>
      <button className={`nav-tab ${view === 'boards' ? 'active' : ''}`} onClick={() => onViewChange('boards')}>Boards</button>
    </div>
    <div className="nav-right">
      <button className={`accessibility-toggle ${accessibilityOn ? 'active' : ''}`}
        onClick={onAccessibilityToggle} title="Toggle accessibility overlay" aria-label="Toggle accessibility overlay">
        ♿
      </button>
    </div>
  </nav>
);
