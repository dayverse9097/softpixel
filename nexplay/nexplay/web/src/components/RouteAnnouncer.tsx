import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Single-page apps do not reload, so keyboard and screen-reader users would be left where they were.
 * After each navigation this scrolls to the top, moves focus to the page heading and announces it.
 */
export function RouteAnnouncer() {
  const { pathname } = useLocation();
  // Compare with the previous path instead of using a "first run" flag, so React's development double-run
  // of effects cannot make the page grab focus on the first load.
  const previous = useRef(pathname);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    window.scrollTo(0, 0);
    const timer = window.setTimeout(() => {
      const heading = document.querySelector<HTMLElement>('main h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
        setMessage(`${heading.textContent ?? 'Page'} loaded`);
      } else {
        document.getElementById('main')?.focus({ preventScroll: true });
        setMessage('Page loaded');
      }
    }, 60);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <div role="status" aria-live="polite" className="sr-only">
      {message}
    </div>
  );
}
