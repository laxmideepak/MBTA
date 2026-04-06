import { useState } from 'react';
import { NavBar } from './NavBar';
import { LiveMap } from './LiveMap';
import { DepartureBoard } from './DepartureBoard';
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
        <DepartureBoard predictions={predictions} alerts={alerts} facilities={facilities} />
      )}
    </>
  );
}
