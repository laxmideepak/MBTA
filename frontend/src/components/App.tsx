import { useState } from 'react';
import { NavBar } from './NavBar';
import { LiveMap } from './LiveMap';
import { DepartureBoard } from './DepartureBoard';
import { WeatherIndicator } from './WeatherIndicator';
import { ErrorBoundary } from './ErrorBoundary';
import { useSystemState } from '../hooks/useSystemState';
import type { ViewMode } from '../types';
import '../styles/global.css';
import '../styles/app.css';

export function App() {
  const [view, setView] = useState<ViewMode>('map');
  const [accessibilityOn, setAccessibilityOn] = useState(false);
  const { vehicles, predictions, alerts, facilities, weather, connected } = useSystemState();

  return (
    <>
      <a
        href="#main-content"
        className="skip-link sr-only"
      >
        Skip to main content
      </a>
      {!connected && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <span className="loading-text">Connecting to live data...</span>
        </div>
      )}
      <NavBar
        view={view} onViewChange={setView}
        accessibilityOn={accessibilityOn}
        onAccessibilityToggle={() => setAccessibilityOn((prev) => !prev)}
        connected={connected}
      />
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {connected ? `Tracking ${vehicles.length} trains live` : 'Connecting to live data...'}
      </div>
      <WeatherIndicator weather={weather} />
      <main id="main-content">
        {view === 'map' && (
          <ErrorBoundary fallbackMessage="Map failed to load">
            <LiveMap vehicles={vehicles} predictions={predictions} alerts={alerts}
              facilities={facilities} accessibilityOn={accessibilityOn} />
          </ErrorBoundary>
        )}
        {view === 'boards' && (
          <ErrorBoundary fallbackMessage="Departure board failed to load">
            <DepartureBoard predictions={predictions} alerts={alerts} facilities={facilities} />
          </ErrorBoundary>
        )}
      </main>
    </>
  );
}
