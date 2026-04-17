import Fuse from 'fuse.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGlobalSlashFocus } from '../hooks/useGlobalSlashFocus';
import { useRouteData } from '../hooks/useRouteData';
import { useScheduledDepartures } from '../hooks/useScheduledDepartures';
import { AlertBanner } from '../overlays/AlertBanner';
import type { Alert, Prediction, Stop } from '../types';
import { getRouteColorHex, getRouteDisplayName } from '../utils/mbta-colors';
import { DIRECTION_NAMES } from '../utils/mbta-routes';
import { type DepartureRow, mergeDepartures } from '../utils/merge-departures';
import { formatScheduledStatus, formatStatus } from '../utils/time-format';

const MAX_ROWS = 12;
const MAX_SUGGESTIONS = 8;
const REFRESH_SECS = 20;

interface BoardsViewProps {
  predictions: Record<string, Prediction[]>;
  alerts: Alert[];
}

export function BoardsView({ predictions, alerts }: BoardsViewProps) {
  const { stops } = useRouteData();
  const [query, setQuery] = useState('');
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [countdown, setCountdown] = useState(REFRESH_SECS);

  const inputRef = useRef<HTMLInputElement | null>(null);
  useGlobalSlashFocus(inputRef);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date());
      setCountdown((c) => (c <= 1 ? REFRESH_SECS : c - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const stopsById = useMemo(() => {
    const m = new Map<string, Stop>();
    for (const s of stops) m.set(s.id, s);
    return m;
  }, [stops]);

  // Build parent-station map: merge child stops that share a name.
  const stationsByName = useMemo(() => {
    const byName = new Map<string, { name: string; ids: string[] }>();
    for (const s of stops) {
      const existing = byName.get(s.name);
      if (existing) existing.ids.push(s.id);
      else byName.set(s.name, { name: s.name, ids: [s.id] });
    }
    return Array.from(byName.values());
  }, [stops]);

  // Fuse.js indexes the station list once and searches with proper fuzzy
  // tolerance (typos, out-of-order tokens). 0.4 threshold keeps obvious
  // matches dominant while still forgiving "hrvrd" → "Harvard".
  const fuse = useMemo(
    () =>
      new Fuse(stationsByName, {
        keys: ['name'],
        threshold: 0.4,
        ignoreLocation: true,
        minMatchCharLength: 1,
      }),
    [stationsByName],
  );

  const suggestions = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return fuse.search(q, { limit: MAX_SUGGESTIONS }).map((r) => r.item);
  }, [fuse, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, []);

  const selectedStation = useMemo(() => {
    if (!selectedStopId) return null;
    const stop = stopsById.get(selectedStopId);
    if (!stop) return null;
    // Collect all child stops that share a name.
    const siblings = stops.filter((s) => s.name === stop.name);
    return { name: stop.name, stopIds: siblings.map((s) => s.id) };
  }, [selectedStopId, stopsById, stops]);

  const stopIdsForSchedules = useMemo(() => selectedStation?.stopIds ?? [], [selectedStation]);
  const schedules = useScheduledDepartures(stopIdsForSchedules);

  // Merge live predictions + published MBTA schedule so the board keeps
  // showing upcoming trips even when predictions are sparse (late night,
  // quiet stops, or when the stream has a brief hiccup).
  const rows: DepartureRow[] = useMemo(() => {
    if (!selectedStation) return [];
    const livePreds: Prediction[] = [];
    for (const id of selectedStation.stopIds) {
      livePreds.push(...(predictions[id] ?? []));
    }
    return mergeDepartures(livePreds, schedules, now.getTime(), { maxRows: MAX_ROWS });
  }, [selectedStation, predictions, schedules, now]);

  const hasAnyLive = rows.some((r) => r.kind === 'live');
  const fallbackOnly = rows.length > 0 && !hasAnyLive;

  const linesServed = useMemo(() => {
    if (!selectedStation) return [] as string[];
    const set = new Set<string>();
    for (const id of selectedStation.stopIds) {
      for (const p of predictions[id] ?? []) set.add(p.routeId);
    }
    // Fall back to routes seen in the schedule when there are no live
    // predictions (e.g. late at night), so the badges still render.
    if (set.size === 0) {
      for (const s of schedules) if (s.routeId) set.add(s.routeId);
    }
    // Sort in canonical order so Red/Orange/Blue/Green/Mattapan look right.
    const order = ['Red', 'Orange', 'Blue', 'Green-B', 'Green-C', 'Green-D', 'Green-E', 'Mattapan'];
    return Array.from(set).sort(
      (a, b) =>
        (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) -
        (order.indexOf(b) === -1 ? 99 : order.indexOf(b)),
    );
  }, [selectedStation, predictions, schedules]);

  // Scope alerts to this station's stop ids or lines, then let AlertBanner
  // rank/filter using the MBTA-curated lifecycle/severity/banner hints.
  const relevantAlerts = useMemo(() => {
    if (!selectedStation) return [];
    const stopSet = new Set(selectedStation.stopIds);
    const routeSet = new Set(linesServed);
    return alerts.filter((a) =>
      (a.informedEntities ?? []).some(
        (e) => (e.stopId && stopSet.has(e.stopId)) || (e.routeId && routeSet.has(e.routeId)),
      ),
    );
  }, [alerts, selectedStation, linesServed]);

  function selectSuggestion(idx: number) {
    const st = suggestions[idx];
    if (!st) return;
    setSelectedStopId(st.ids[0]);
    setQuery(st.name);
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectSuggestion(activeIdx);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  }

  return (
    <section className="boards" aria-label="Station departure boards">
      <div className="boards-card">
        <div className="boards-search-wrap">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (selectedStopId) setSelectedStopId(null);
            }}
            onKeyDown={onSearchKeyDown}
            placeholder="Type a station…"
            className="boards-search-input"
            aria-label="Search station"
            autoComplete="off"
            spellCheck={false}
          />
          {suggestions.length > 0 && !selectedStopId && (
            <div className="boards-suggestions" role="listbox">
              {suggestions.map((s, i) => (
                <button
                  key={s.name}
                  type="button"
                  role="option"
                  aria-selected={i === activeIdx}
                  className={`boards-suggestion ${i === activeIdx ? 'boards-suggestion--active' : ''}`}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => selectSuggestion(i)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedStation && (
          <div className="boards-station-header">
            <AlertBanner alerts={relevantAlerts} />
            <div className="boards-station-name">{selectedStation.name}</div>
            <div className="boards-line-badges">
              {linesServed.map((routeId) => (
                <span
                  key={routeId}
                  className="boards-line-badge"
                  style={{ background: getRouteColorHex(routeId) }}
                >
                  {getRouteDisplayName(routeId)}
                </span>
              ))}
            </div>
            <div className="boards-station-meta">
              {/* Fare and published-timetable links per MBTA's public site. */}
              <a
                className="boards-meta-chip boards-meta-chip--fare"
                href="https://www.mbta.com/fares/subway"
                target="_blank"
                rel="noreferrer noopener"
                title="Subway fare on mbta.com"
              >
                <span>Subway</span>
                <strong>$2.40</strong>
              </a>
              {linesServed.slice(0, 3).map((routeId) => (
                <a
                  key={routeId}
                  className="boards-meta-chip"
                  href={`https://www.mbta.com/schedules/${encodeURIComponent(routeId)}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {getRouteDisplayName(routeId)} timetable ↗
                </a>
              ))}
            </div>

            {fallbackOnly && (
              <div className="boards-sched-note" role="status">
                Showing published schedule — live predictions not available right now.
              </div>
            )}

            {rows.length === 0 ? (
              <div className="boards-empty">
                No upcoming departures — service may have ended for the night.
              </div>
            ) : (
              // biome-ignore lint/a11y/useSemanticElements: CSS grid layout; role="list" is correct ARIA
              <div className="boards-table" role="list" aria-label="Upcoming departures">
                {rows.map((row) => {
                  const color = getRouteColorHex(row.routeId);
                  const lineShort = getRouteDisplayName(row.routeId)
                    .replace('Line ', '')
                    .replace(' Line', '')
                    .replace(' Trolley', '');
                  const dest = DIRECTION_NAMES[row.routeId]?.[row.directionId] ?? '';
                  const statusText =
                    row.kind === 'live'
                      ? formatStatus(row.arrivalTime, row.status, now)
                      : formatScheduledStatus(row.arrivalTime, now);
                  const statusMod =
                    row.kind === 'live' && statusText === 'Boarding'
                      ? 'boarding'
                      : row.kind === 'live' && statusText === 'Arriving'
                        ? 'arriving'
                        : null;
                  return (
                    // biome-ignore lint/a11y/useSemanticElements: CSS grid layout; role="listitem" is correct ARIA
                    <div
                      key={row.key}
                      className={`boards-row boards-row--${row.kind}`}
                      role="listitem"
                    >
                      <span
                        className="boards-row-bar"
                        style={{ background: color }}
                        aria-hidden="true"
                      />
                      <span className="boards-row-line" style={{ color }}>
                        {lineShort}
                      </span>
                      <span className="boards-row-dest">{dest}</span>
                      <span
                        className={`boards-row-status${statusMod ? ` boards-row-status--${statusMod}` : ''}`}
                      >
                        {row.kind === 'scheduled' && (
                          <span className="boards-row-sched-chip">SCHED</span>
                        )}
                        {statusText}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="boards-refresh">Updating in {countdown}s</div>
          </div>
        )}
      </div>

      <div className="boards-disclaimer">
        Live predictions update every 10s–60s. Scheduled rows come from mbta.com/schedules.
      </div>
    </section>
  );
}
