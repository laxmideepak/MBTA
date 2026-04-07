import { Suspense, lazy, useState, useEffect } from 'react';
import { NavBar } from './NavBar';
import { WeatherIndicator } from './WeatherIndicator';
import { ErrorBoundary } from './ErrorBoundary';
import { useSystemState } from '../hooks/useSystemState';
import type { ViewMode } from '../types';
import '../styles/global.css';
import '../styles/app.css';

const LiveMap = lazy(() => import('./LiveMap'));
const DepartureBoard = lazy(() => import('./DepartureBoard'));

function ConnectionBanner({ connected, lastMessageTime }: { connected: boolean; lastMessageTime: number }) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (lastMessageTime > 0 && Date.now() - lastMessageTime > 60000) {
        setStale(true);
      } else {
        setStale(false);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [lastMessageTime]);

  if (connected && !stale) return null;

  const message = !connected ? 'Reconnecting to live data...' : 'Data may be stale';
  const bgColor = !connected ? 'rgba(255, 152, 0, 0.15)' : 'rgba(255, 152, 0, 0.1)';
  const textColor = !connected ? '#FF9800' : '#FF9800';

  return (
    <div role="alert" style={{
      position: 'fixed', top: 48, left: 0, right: 0, zIndex: 998,
      padding: '6px 20px', background: bgColor,
      borderBottom: '1px solid rgba(255,152,0,0.3)',
      fontSize: 13, color: textColor, textAlign: 'center',
    }}>
      {message}
    </div>
  );
}

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
            <Suspense fallback={<div className="loading-overlay"><div className="loading-spinner" /><span className="loading-text">Loading map...</span></div>}>
              <LiveMap vehicles={vehicles} predictions={predictions} alerts={alerts}
                facilities={facilities} accessibilityOn={accessibilityOn} />
            </Suspense>
          </ErrorBoundary>
        )}
        {view === 'boards' && (
          <ErrorBoundary fallbackMessage="Departure board failed to load">
            <Suspense fallback={<div className="loading-overlay"><div className="loading-spinner" /><span className="loading-text">Loading map...</span></div>}>
              <DepartureBoard predictions={predictions} alerts={alerts} facilities={facilities} />
            </Suspense>
          </ErrorBoundary>
        )}
      </main>
    </>
  );
}
