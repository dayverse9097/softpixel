import { useEffect } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Backdrop, SkipLink } from '../components/Layout';
import { Logo } from '../components/Logo';
import { RouteAnnouncer } from '../components/RouteAnnouncer';
import { ErrorState, Spinner } from '../components/States';
import { cx } from '../lib/cx';
import { ApiError } from '../lib/api';
import { AdminProvider, useAdmin } from './AdminProvider';

/** Keeps the admin area out of search results. */
function NoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
  return null;
}

export function AdminRoot() {
  return (
    <AdminProvider>
      <NoIndex />
      <SkipLink />
      <Backdrop />
      <Outlet />
    </AdminProvider>
  );
}

/** Everything under this route needs a signed-in administrator. The server enforces the same rule on every request. */
export function RequireAdmin() {
  const { status, retry } = useAdmin();
  const location = useLocation();
  if (status === 'loading') return <main id="main" tabIndex={-1} className="wrap pt-20"><Spinner label="Checking your session" /></main>;
  if (status === 'unavailable') {
    return (
      <main id="main" tabIndex={-1} className="wrap pt-20">
        <ErrorState error={new ApiError(0, 'network', 'The server could not be reached.')} onRetry={retry} title="Can’t reach the server" />
      </main>
    );
  }
  if (status === 'anonymous') return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

const LINKS = [
  { to: '/admin', label: 'Games', end: true },
  { to: '/admin/games/new', label: 'New game', end: false },
  { to: '/admin/security', label: 'Security', end: false },
  { to: '/admin/audit', label: 'Activity', end: false },
];

export function AdminLayout() {
  const { user, signOut } = useAdmin();
  const navigate = useNavigate();
  return (
    <>
      <div className="sticky top-[env(safe-area-inset-top,0px)] z-50 pt-3">
        <header className="glass mx-auto flex w-[min(1160px,calc(100%_-_24px))] flex-wrap items-center gap-x-4 gap-y-1 !rounded-[28px] px-4 py-2">
          <Logo to="/admin" label="NEXPLAY admin home" />
          <span className="tag tag-muted">Admin</span>
          <nav aria-label="Admin" className="flex flex-wrap gap-1">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => cx('inline-flex min-h-[44px] items-center rounded-full px-3.5 font-semibold no-underline hover:bg-white/10', isActive ? 'bg-white/[0.12]' : 'text-ink-50/75')}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Link to="/" className="inline-flex min-h-[44px] items-center px-2 font-semibold text-muted no-underline">
              View site
            </Link>
            <span className="hidden text-sm text-faint sm:inline">{user?.email}</span>
            <button
              type="button"
              className="btn btn-glass"
              onClick={async () => {
                await signOut();
                navigate('/admin/login', { replace: true });
              }}
            >
              Sign out
            </button>
          </div>
        </header>
      </div>
      <main id="main" tabIndex={-1} className="wrap pb-10 outline-none">
        <Outlet />
      </main>
      <RouteAnnouncer />
    </>
  );
}
