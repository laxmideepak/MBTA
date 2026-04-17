import { lazy, Suspense, useState } from 'react';
import { useSystemState } from '../hooks/useSystemState';
import type { ViewMode } from '../types';
import { ErrorBoundary } from './ErrorBoundary';
import { Footer } from './Footer';
import { InteractionHint } from './InteractionHint';
import { TopBar } from './TopBar';
import '../styles/global.css';
import '../styles/app.css';

// Both heavy screens are lazy-loaded so the initial bundle only ships the
// chrome (TopBar / Footer / chip CSS). LiveMap pulls in deck.gl + maplibre;
// BoardsView pulls in fuse.js for fuzzy station search — neither is needed
// before first paint.
const LiveMap = lazy(() => import('./LiveMap'));
const BoardsView = lazy(() => import('./BoardsView').then((m) => ({ default: m.BoardsView })));

export function App() {
  const { vehicles, predictions, alerts, connected, lastMessageTime } = useSystemState();
  const [viewMode, setViewMode] = useState<ViewMode>('map');

  return (
    <div className="app-shell">
      <TopBar
        connected={connected}
        lastMessageTime={lastMessageTime}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      <main id="main-content" className="map-container" aria-label="Boston Live Transit">
        <ErrorBoundary fallbackMessage="Map failed to load">
          <Suspense
            fallback={
              <div className="loading-overlay">
                <div className="loading-spinner" />
              </div>
            }
          >
            <LiveMap vehicles={vehicles} predictions={predictions} alerts={alerts} />
          </Suspense>
        </ErrorBoundary>
        {viewMode === 'boards' && (
          <Suspense fallback={null}>
            <BoardsView predictions={predictions} alerts={alerts} />
          </Suspense>
        )}
        {viewMode === 'map' && <InteractionHint />}
      </main>
      <Footer />
    </div>
  );
}
