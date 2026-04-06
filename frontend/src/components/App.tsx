import { useState } from 'react';
import { NavBar } from './NavBar';
import { LiveMap } from './LiveMap';
import { useSystemState } from '../hooks/useSystemState';
import type { ViewMode } from '../types';
import '../styles/global.css';

export function App() {
  const [view, setView] = useState<ViewMode>('map');
  const [accessibilityOn, setAccessibilityOn] = useState(false);
  const { vehicles, predictions, alerts, facilities, weather, connected } = useSystemState();

  return (
    <>
      <NavBar
        view={view} onViewChange={setView}
        accessibilityOn={accessibilityOn}
        onAccessibilityToggle={() => setAccessibilityOn((prev) => !prev)}
        connected={connected}
      />
      {view === 'map' && (
        <LiveMap vehicles={vehicles} predictions={predictions} alerts={alerts}
          facilities={facilities} accessibilityOn={accessibilityOn} />
      )}
      {view === 'boards' && (
        <div style={{ paddingTop: 60, textAlign: 'center', color: '#888' }}>
          Departure boards — coming soon
        </div>
      )}
    </>
  );
}
