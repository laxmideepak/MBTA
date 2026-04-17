import { useEffect, useMemo, useState } from 'react';

type Status = 'LIVE' | 'STALE' | 'OFFLINE';

export function LivePill({
  connected,
  lastMessageTime,
}: {
  connected: boolean;
  lastMessageTime: number;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const status: Status = useMemo(() => {
    if (!connected) return 'OFFLINE';
    if (lastMessageTime > 0 && now - lastMessageTime > 60_000) return 'STALE';
    return 'LIVE';
  }, [connected, lastMessageTime, now]);

  const pillClass =
    status === 'STALE'
      ? 'live-pill live-pill--stale'
      : status === 'OFFLINE'
        ? 'live-pill live-pill--offline'
        : 'live-pill';

  const dotClass =
    status === 'LIVE'
      ? 'live-dot live-dot--live'
      : status === 'STALE'
        ? 'live-dot live-dot--stale'
        : 'live-dot live-dot--offline';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Feed status: ${status}`}
      className={pillClass}
    >
      <span aria-hidden="true" className={dotClass} />
      {status}
    </div>
  );
}
