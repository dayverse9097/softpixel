import { Outlet, useLocation } from 'react-router-dom';
import { Footer } from './Footer';
import { Header } from './Header';
import { PageTransition } from './PageTransition';
import { Particles } from './Particles';
import { RouteAnnouncer } from './RouteAnnouncer';

/** Background that sits behind every page: drifting gradient orbs and a few particles. */
export function Backdrop({ paused = false }: { paused?: boolean }) {
  return (
    <>
      <div aria-hidden="true" className={`fixed inset-0 -z-20 overflow-hidden bg-[radial-gradient(120%_80%_at_50%_-10%,#0d1438_0%,#060a18_60%)] ${paused ? '[&_i]:![animation-play-state:paused]' : ''}`}>
        <i className="absolute -left-[24vmax] -top-[26vmax] size-[62vmax] animate-drift1 rounded-full bg-[radial-gradient(circle,rgba(157,92,255,.36),transparent_62%)] will-change-transform" />
        <i className="absolute -right-[24vmax] top-[8vh] size-[56vmax] animate-drift2 rounded-full bg-[radial-gradient(circle,rgba(41,225,255,.24),transparent_62%)] will-change-transform" />
        <i className="absolute -bottom-[32vmax] left-[12vw] size-[52vmax] animate-drift3 rounded-full bg-[radial-gradient(circle,rgba(70,70,210,.32),transparent_62%)] will-change-transform" />
      </div>
      <Particles paused={paused} />
    </>
  );
}

export function SkipLink() {
  return (
    <a
      href="#main"
      className="absolute left-3 top-[-80px] z-[100] rounded-xl bg-white px-4 py-2.5 font-bold text-ink-950 focus:top-[calc(env(safe-area-inset-top,0px)+8px)]"
    >
      Skip to content
    </a>
  );
}

export function PublicLayout() {
  const { pathname } = useLocation();
  const playing = pathname.startsWith('/play/');
  return (
    <>
      <SkipLink />
      <Backdrop paused={playing} />
      <Header />
      <main id="main" tabIndex={-1} className="pb-6 outline-none">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <Footer />
      <RouteAnnouncer />
    </>
  );
}
