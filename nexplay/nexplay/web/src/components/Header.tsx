import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { cx } from '../lib/cx';
import { Icon } from './Icons';
import { Logo } from './Logo';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/discover', label: 'Discover', end: false },
  { to: '/favorites', label: 'Favorites', end: false },
  { to: '/about', label: 'About', end: false },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    'inline-flex min-h-[44px] items-center rounded-full px-3.5 font-semibold no-underline hover:bg-white/10 hover:text-ink-50',
    isActive ? 'bg-white/[0.12] text-ink-50' : 'text-ink-50/75',
  );

export function Header() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const search = (event: FormEvent) => {
    event.preventDefault();
    const value = query.replace(/\s+/g, ' ').trim().slice(0, 80);
    navigate(value ? `/discover?q=${encodeURIComponent(value)}` : '/discover');
    setQuery('');
  };

  return (
    <div className="sticky top-[env(safe-area-inset-top,0px)] z-50 pt-3">
      <header className="glass mx-auto flex w-[min(1160px,calc(100%_-_24px))] items-center gap-3.5 !rounded-full py-2 pl-3.5 pr-2.5">
        <Logo />
        <nav aria-label="Primary" className="ml-2 hidden gap-1 min-[900px]:flex">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <form role="search" onSubmit={search} className="ml-auto hidden w-[min(300px,34vw)] min-[900px]:block">
          <label className="field">
            <span className="sr-only">Search games</span>
            <Icon name="search" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search games" autoComplete="off" maxLength={80} />
          </label>
        </form>
        <button
          ref={menuButton}
          type="button"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label="Menu"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto grid size-11 place-items-center rounded-full border border-white/[0.18] bg-white/[0.08] min-[900px]:hidden"
        >
          <Icon name={open ? 'close' : 'menu'} />
        </button>
      </header>
      <nav
        id="mobile-menu"
        aria-label="Primary menu"
        hidden={!open}
        className="glass absolute left-1/2 top-[calc(100%_+_8px)] flex w-[min(1160px,calc(100%_-_24px))] -translate-x-1/2 flex-col rounded-card p-2 min-[900px]:!hidden"
      >
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
            {item.label}
          </NavLink>
        ))}
        <form role="search" onSubmit={search} className="p-2 pt-1">
          <label className="field">
            <span className="sr-only">Search games</span>
            <Icon name="search" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search games" autoComplete="off" maxLength={80} />
          </label>
        </form>
      </nav>
    </div>
  );
}
