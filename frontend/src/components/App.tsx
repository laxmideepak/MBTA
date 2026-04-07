import { useState } from 'react';
import { NavBar } from './NavBar';
import { LiveMap } from './LiveMap';
import { DepartureBoard } from './DepartureBoard';
import { WeatherIndicator } from './WeatherIndicator';
import { useSystemState } from '../hooks/useSystemState';
import type { ViewMode } from '../types';
import '../styles/global.css';

export function App() {
  const [view, setView] = useState<ViewMode>('map');
  const [accessibilityOn, setAccessibilityOn] = useState(false);
  const { vehicles, predictions, alerts, facilities, weather, connected } = useSystemState();

  return (
    <>
      <a
        href="#main-content"
        className="sr-only"
        style={{
          position: 'absolute', top: '-40px', left: 0,
          background: '#000', color: '#fff', padding: '8px', zIndex: 10000,
        }}
        onFocus={(e) => { (e.target as HTMLElement).style.top = '0'; }}
        onBlur={(e) => { (e.target as HTMLElement).style.top = '-40px'; }}
      >
        Skip to main content
      </a>
      {!connected && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: '#0a0a0a', gap: 16,
        }}>
          <div style={{
            width: 40, height: 40,
            border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#DA291C',
            borderRadius: '50%', animation: 'spin 1s linear infinite',
          }} />
          <span style={{ color: '#888', fontSize: 14 }}>Connecting to live data...</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
          <LiveMap vehicles={vehicles} predictions={predictions} alerts={alerts}
            facilities={facilities} accessibilityOn={accessibilityOn} />
        )}
        {view === 'boards' && (
          <DepartureBoard predictions={predictions} alerts={alerts} facilities={facilities} />
        )}
      </main>
    </>
  );
}
