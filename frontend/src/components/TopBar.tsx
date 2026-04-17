import type { ViewMode } from '../types';
import { LivePill } from './LivePill';

export function TopBar({
  connected,
  lastMessageTime,
  viewMode,
  onViewModeChange,
}: {
  connected: boolean;
  lastMessageTime: number;
  viewMode: ViewMode;
  onViewModeChange: (next: ViewMode) => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-wordmark">
          bostonlive<span className="topbar-wordmark-dot">.</span>transit
        </span>
        <LivePill connected={connected} lastMessageTime={lastMessageTime} />
      </div>

      <nav className="topbar-tabs view-selector" aria-label="Primary">
        <button
          type="button"
          className={`topbar-tab ${viewMode === 'map' ? 'topbar-tab--active' : ''}`}
          onClick={() => onViewModeChange('map')}
          aria-current={viewMode === 'map' ? 'page' : undefined}
        >
          MAP
        </button>
        <button
          type="button"
          className={`topbar-tab ${viewMode === 'boards' ? 'topbar-tab--active' : ''}`}
          onClick={() => onViewModeChange('boards')}
          aria-current={viewMode === 'boards' ? 'page' : undefined}
        >
          BOARDS
        </button>
      </nav>

      <div className="topbar-right" aria-hidden="true" />
    </header>
  );
}
