export function Footer() {
  return (
    <footer className="site-footer" role="contentinfo">
      <span>MBTA</span>
      <span className="site-footer-dot">·</span>
      <span>
        <a href="https://www.maptiler.com/" target="_blank" rel="noreferrer noopener">
          MapTiler
        </a>
      </span>
      <span className="site-footer-dot">·</span>
      <span>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer noopener">
          OpenStreetMap contributors
        </a>
      </span>
      <span className="site-footer-dot">·</span>
      <span>
        inspired by{' '}
        <a href="https://londonunderground.live" target="_blank" rel="noreferrer noopener">
          londonunderground.live
        </a>
      </span>
      <span className="site-footer-sponsor-slot" aria-hidden="true" />
    </footer>
  );
}
