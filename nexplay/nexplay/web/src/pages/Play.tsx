import { Link, useParams } from 'react-router-dom';
import { FavoriteButton } from '../components/FavoriteButton';
import { GamePlayer } from '../components/GamePlayer';
import { Icon } from '../components/Icons';
import { ErrorState, Spinner } from '../components/States';
import { useApi } from '../hooks/useApi';
import { usePageTitle } from '../hooks/usePageTitle';
import { api } from '../lib/api';
import { recentlyPlayed } from '../lib/storage';
import { NotFoundPage } from './NotFound';

export function PlayPage() {
  const { slug = '' } = useParams();
  const game = useApi((signal) => api.getGame(slug, signal), [slug]);
  usePageTitle(game.data ? `Playing ${game.data.title}` : null);

  if (game.error?.status === 404) return <NotFoundPage />;
  if (game.error) return <div className="wrap pt-10"><ErrorState error={game.error} onRetry={game.reload} title="This game didn’t load" /></div>;
  if (!game.data) return <div className="wrap pt-10"><Spinner label="Loading game" /></div>;

  const g = game.data;
  return (
    <div className="wrap">
      <div className="flex flex-wrap items-center justify-between gap-x-[18px] gap-y-3 pb-4 pt-5">
        <Link to={`/game/${g.slug}`} className="btn btn-glass">
          <Icon name="back" />
          Details
        </Link>
        <h1 className="text-[clamp(1.3rem,3.4vw,1.9rem)]">{g.title}</h1>
        <FavoriteButton slug={g.slug} title={g.title} variant="text" />
      </div>
      <GamePlayer
        key={g.slug}
        url={g.playUrl}
        title={g.title}
        onStart={() => {
          recentlyPlayed.push(g.slug);
          void api.recordLaunch(g.slug);
        }}
      />
      {g.controls.length > 0 && (
        <p className="mt-2 text-muted">
          Controls: {g.controls.map((c) => `${c.input}, ${c.action.charAt(0).toLowerCase()}${c.action.slice(1)}`).join('. ')}.
        </p>
      )}
    </div>
  );
}
