import { Link, useParams } from 'react-router-dom';
import { CoverImage } from '../components/CoverImage';
import { FavoriteButton } from '../components/FavoriteButton';
import { GameGrid, PlayLink } from '../components/GameCard';
import { Icon } from '../components/Icons';
import { ErrorState, Spinner } from '../components/States';
import { useApi } from '../hooks/useApi';
import { usePageTitle } from '../hooks/usePageTitle';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { NotFoundPage } from './NotFound';

export function GameDetailPage() {
  const { slug = '' } = useParams();
  const game = useApi((signal) => api.getGame(slug, signal), [slug]);
  const more = useApi((signal) => api.listGames({ sort: 'new', pageSize: 5 }, signal), []);
  usePageTitle(game.data?.title);

  if (game.error?.status === 404) return <NotFoundPage />;
  if (game.error) return <div className="wrap pt-10"><ErrorState error={game.error} onRetry={game.reload} title="This game didn’t load" /></div>;
  if (!game.data) return <div className="wrap pt-10"><Spinner label="Loading game" /></div>;

  const g = game.data;
  const others = (more.data?.items ?? []).filter((x) => x.slug !== g.slug).slice(0, 3);

  return (
    <div className="wrap">
      <nav aria-label="Breadcrumb" className="pt-6">
        <Link to="/discover" className="inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-muted no-underline">
          <Icon name="back" />
          All games
        </Link>
      </nav>
      <section className="mt-2 grid items-start gap-8 min-[900px]:grid-cols-[1.1fr_1fr]">
        <div className="glass rounded-panel p-3.5">
          <CoverImage game={g} className="!rounded-card" />
        </div>
        <div className="grid gap-[18px]">
          <span className="tag">{g.category}</span>
          <h1 className="text-[clamp(1.7rem,4vw,2.6rem)]">{g.title}</h1>
          <p className="max-w-[52ch] text-[1.1rem] text-muted">{g.description}</p>
          <div className="flex flex-wrap gap-3">
            <PlayLink game={g} />
            <FavoriteButton slug={g.slug} title={g.title} variant="text" />
          </div>
          <div className="glass grid gap-2.5 rounded-card p-[22px]">
            {g.instructions && (
              <>
                <h2 className="text-base">How to play</h2>
                <p className="whitespace-pre-line text-muted">{g.instructions}</p>
              </>
            )}
            {g.controls.length > 0 && (
              <>
                <h2 className="mt-1.5 text-base">Controls</h2>
                <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-[18px] gap-y-1.5">
                  {g.controls.map((c, i) => (
                    <div key={i} className="contents">
                      <dt className="font-bold">{c.input}</dt>
                      <dd className="m-0 text-muted">{c.action}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            <dl className="m-0 mt-1.5 flex flex-wrap gap-x-7 gap-y-2">
              {g.version && (
                <div className="grid">
                  <dt className="text-sm text-faint">Version</dt>
                  <dd className="m-0 font-semibold">{g.version}</dd>
                </div>
              )}
              {g.publishedAt && (
                <div className="grid">
                  <dt className="text-sm text-faint">Published</dt>
                  <dd className="m-0 font-semibold">{formatDate(g.publishedAt)}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </section>
      {others.length > 0 && (
        <section className="mt-14" aria-labelledby="more-heading">
          <h2 id="more-heading" className="mb-[18px] text-[clamp(1.1rem,2.6vw,1.45rem)]">
            More to play
          </h2>
          <GameGrid games={others} />
        </section>
      )}
    </div>
  );
}
