import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { CoverImage } from '../components/CoverImage';
import { GameGrid, PlayLink } from '../components/GameCard';
import { Icon } from '../components/Icons';
import { EmptyState, ErrorState, LoadingGrid } from '../components/States';
import { useApi } from '../hooks/useApi';
import { usePageTitle } from '../hooks/usePageTitle';
import { api } from '../lib/api';
import { plural } from '../lib/format';
import { site } from '../lib/site';

export function HomePage() {
  usePageTitle(null);
  const navigate = useNavigate();
  const featured = useApi((signal) => api.listGames({ featured: true, pageSize: 1 }, signal), []);
  const latest = useApi((signal) => api.listGames({ sort: 'new', pageSize: 8 }, signal), []);
  const categories = useApi((signal) => api.categories(signal), []);

  const hero = featured.data?.items[0] ?? latest.data?.items[0];
  const failure = latest.error ?? featured.error;
  const nothingYet = latest.data && latest.data.total === 0;

  const surprise = () => {
    const pool = latest.data?.items ?? [];
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) navigate(`/game/${pick.slug}`);
  };

  return (
    <div className="wrap">
      <section className="grid items-center gap-10 pb-2 pt-7 min-[900px]:grid-cols-[1.05fr_.95fr] min-[900px]:pt-14">
        <div>
          <h1 className="mb-[18px] text-[clamp(1.9rem,5.2vw,3.5rem)] leading-[1.08]">{site.tagline}</h1>
          <p className="mb-7 max-w-[52ch] text-[1.1rem] text-muted">{site.name} is a library of games that run right in your browser. No downloads, no sign-ups.</p>
          <div className="flex flex-wrap gap-3">
            <Link to="/discover" className="btn btn-primary">
              Browse all games
            </Link>
            {hero && (
              <Link to={`/play/${hero.slug}`} className="btn btn-glass">
                <Icon name="play" />
                Play {hero.title}
              </Link>
            )}
          </div>
        </div>

        <div className="relative isolate">
          <i aria-hidden="true" className="absolute -right-[8%] -top-[14%] -z-10 aspect-square w-3/5 animate-drift2 rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(41,225,255,.8),rgba(157,92,255,.55)_55%,transparent_72%)]" />
          {hero ? (
            <motion.article className="glass flex flex-col gap-3 rounded-panel p-3.5" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }}>
              <CoverImage game={hero} className="!rounded-card" />
              <div className="flex flex-wrap gap-2 px-1.5">
                <span className="tag tag-gold">{featured.data?.items[0] ? 'Featured' : 'New'}</span>
                <span className="tag">{hero.category}</span>
              </div>
              <h2 className="px-1.5 text-2xl">
                <Link to={`/game/${hero.slug}`} className="no-underline">
                  {hero.title}
                </Link>
              </h2>
              <p className="px-1.5 text-muted">{hero.description}</p>
              <div className="flex flex-wrap gap-3 px-1.5 pb-1">
                <PlayLink game={hero} />
                <Link to={`/game/${hero.slug}`} className="btn btn-glass">
                  Details
                </Link>
              </div>
            </motion.article>
          ) : (
            <div aria-hidden="true" className="glass animate-shimmer rounded-panel p-3.5">
              <div className="aspect-[16/10] rounded-card bg-white/[0.07]" />
              <div className="space-y-3 p-3 pt-5">
                <div className="h-6 w-1/2 rounded bg-white/[0.07]" />
                <div className="h-4 w-full rounded bg-white/[0.05]" />
              </div>
            </div>
          )}
        </div>
      </section>

      {failure && !hero && (
        <section className="mt-12">
          <ErrorState error={failure} onRetry={() => { featured.reload(); latest.reload(); categories.reload(); }} title="The game library didn’t load" />
        </section>
      )}

      {nothingYet && (
        <section className="mt-12">
          <EmptyState title="No games have been published yet">
            <p>Check back soon.</p>
          </EmptyState>
        </section>
      )}

      {(categories.data?.length ?? 0) > 0 && (
        <section className="mt-14" aria-labelledby="categories-heading">
          <h2 id="categories-heading" className="mb-[18px] text-[clamp(1.1rem,2.6vw,1.45rem)]">
            Browse by category
          </h2>
          <div className="flex flex-wrap gap-2.5">
            {categories.data?.map((c) => (
              <Link key={c.name} to={`/discover?cat=${encodeURIComponent(c.name)}`} className="chip">
                {c.name}
                <span className="text-[0.85rem] font-medium text-muted">{plural(c.count, 'game')}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!nothingYet && !failure && (
        <section className="mt-14" aria-labelledby="latest-heading">
          <div className="mb-[18px] flex items-end justify-between gap-4">
            <h2 id="latest-heading" className="text-[clamp(1.1rem,2.6vw,1.45rem)]">
              Recently published
            </h2>
            <Link to="/discover" className="font-semibold text-neon-cyan">
              See all games
            </Link>
          </div>
          {latest.data ? <GameGrid games={latest.data.items.slice(0, 4)} /> : <LoadingGrid count={4} />}
        </section>
      )}

      {(latest.data?.items.length ?? 0) > 1 && (
        <section className="mt-14">
          <div className="glass flex flex-wrap items-center justify-between gap-5 rounded-panel p-7">
            <div>
              <h2 className="mb-1.5 text-xl">Not sure what to play?</h2>
              <p className="text-muted">Let {site.name} pick a game for you.</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={surprise}>
              Surprise me
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
