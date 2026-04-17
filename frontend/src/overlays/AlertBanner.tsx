import { type FC, useState } from 'react';
import type { Alert } from '../types';
import { classifyAlert, rankAlerts } from '../utils/alert-priority';
import { getRouteColorHex, getRouteDisplayName } from '../utils/mbta-colors';

interface AlertBannerProps {
  alerts: Alert[];
  /**
   * If set, only show alerts that affect this set of route/stop ids.
   * BoardsView passes station-specific filter; map-wide banner passes none.
   */
  maxVisible?: number;
}

export const AlertBanner: FC<AlertBannerProps> = ({ alerts, maxVisible = 3 }) => {
  const ranked = rankAlerts(alerts);
  if (ranked.length === 0) return null;
  const visible = ranked.slice(0, maxVisible);
  const overflow = ranked.length - visible.length;

  return (
    <div className="alert-banner" role="alert">
      <div className="alert-banner-list">
        {visible.map((a) => (
          <AlertRow key={a.id} alert={a} />
        ))}
        {overflow > 0 && (
          <div className="alert-banner-overflow">
            +{overflow} more {overflow === 1 ? 'alert' : 'alerts'}
          </div>
        )}
      </div>
    </div>
  );
};

const AlertRow: FC<{ alert: Alert }> = ({ alert }) => {
  const [expanded, setExpanded] = useState(false);
  const vis = classifyAlert(alert);
  const routeIds = Array.from(
    new Set(alert.informedEntities.map((e) => e.routeId).filter((id): id is string => !!id)),
  );
  // Prefer the shortest label that's still informative.
  const primary = alert.serviceEffect || alert.shortHeader || alert.header;
  const bannerText = alert.banner;
  const detailText =
    alert.description && alert.description !== alert.header ? alert.description : alert.header;
  const hasDetail = !!bannerText || (detailText && detailText !== primary);

  return (
    <div className={`alert-row alert-row--rank-${vis.rank ?? 9}`}>
      <div className="alert-row-head">
        <span className="alert-row-dot" aria-hidden="true" />
        <div className="alert-row-lines">
          {routeIds.slice(0, 3).map((id) => (
            <span
              key={id}
              className="alert-route-chip"
              style={{ background: getRouteColorHex(id) }}
              title={getRouteDisplayName(id)}
            >
              {id.replace(/^Green-/, 'GL ')}
            </span>
          ))}
        </div>
        <span className="alert-row-title">{primary}</span>
        {vis.chip && (
          <span className={`alert-row-lc alert-row-lc--${vis.chip.toLowerCase()}`}>{vis.chip}</span>
        )}
        {alert.timeframe && <span className="alert-row-timeframe">{alert.timeframe}</span>}
        {hasDetail && (
          <button
            type="button"
            className="alert-row-more"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? 'Less' : 'More'}
          </button>
        )}
      </div>
      {expanded && (
        <div className="alert-row-detail">
          {bannerText && <p className="alert-row-banner">{bannerText}</p>}
          {detailText && detailText !== primary && <p>{detailText}</p>}
          {alert.url && (
            <a
              href={alert.url}
              target="_blank"
              rel="noreferrer noopener"
              className="alert-row-link"
            >
              Read more on mbta.com →
            </a>
          )}
        </div>
      )}
    </div>
  );
};
