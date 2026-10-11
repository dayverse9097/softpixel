import { Link } from 'react-router-dom';
import { site } from '../lib/site';

const LINKS: ReadonlyArray<{ to: string; label: string }> = [
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/terms', label: 'Terms' },
];

export function Footer() {
  return (
    <footer className="wrap mt-16 pb-7">
      <div className="glass flex flex-wrap items-center justify-between gap-x-7 gap-y-3 rounded-panel px-6 py-4 text-[0.93rem] text-muted">
        <span>© {site.name}</span>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-2">
          {LINKS.map(({ to, label }) => (
            <Link key={to} to={to} className="inline-flex min-h-[44px] items-center px-2.5 font-semibold no-underline hover:text-ink-50">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
