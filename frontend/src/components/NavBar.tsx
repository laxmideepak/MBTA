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
  onStationListToggle?: () => void;
  stationListVisible?: boolean;
}

export const NavBar: FC<NavBarProps> = ({ view, onViewChange, accessibilityOn, onAccessibilityToggle, connected, onStationListToggle, stationListVisible }) => (
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
      {onStationListToggle && (
        <button
          className={`accessibility-toggle ${stationListVisible ? 'active' : ''}`}
          onClick={onStationListToggle}
          aria-label="Toggle station list"
          aria-pressed={stationListVisible ?? false}
        >
          <span aria-hidden="true">☰</span>
          <span className="sr-only">Stations</span>
        </button>
      )}
      <button
        className={`accessibility-toggle ${accessibilityOn ? 'active' : ''}`}
        onClick={onAccessibilityToggle}
        aria-label="Toggle accessibility overlay"
        aria-pressed={accessibilityOn}
      >
        <span aria-hidden="true">♿</span>
        <span className="sr-only">Accessibility</span>
      </button>
    </div>
  </nav>
);
