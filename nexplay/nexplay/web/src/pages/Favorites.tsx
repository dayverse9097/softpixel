import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useFavorites } from '../components/FavoriteButton';
import { GameGrid } from '../components/GameCard';
import { EmptyState, LoadingGrid } from '../components/States';
import { useGamesBySlugs } from '../hooks/useGamesBySlugs';
import { usePageTitle } from '../hooks/usePageTitle';
import { favorites, recentlyPlayed } from '../lib/storage';
import { useSyncExternalStore } from 'react';

function Section({ id, title, slugs, empty, action }: { id: string; title: string; slugs: readonly string[]; empty: string; action?: ReactNode }) {
  const { games, unavailable, loading } = useGamesBySlugs(slugs);
  return (
    <section className="mt-12" aria-labelledby={id}>
      <div className="mb-[18px] flex items-end justify-between gap-4">
        <h2 id={id} className="text-[clamp(1.1rem,2.6vw,1.45rem)]">
          {title}
        </h2>
        {action}
      </div>
      {slugs.length === 0 ? (
        <EmptyState title={empty}>
          <Link to="/discover" className="btn btn-primary">
            Browse games
          </Link>
        </EmptyState>
      ) : loading && games.length === 0 ? (
        <LoadingGrid count={Math.min(slugs.length, 4)} />
      ) : (
        <>
          <GameGrid games={games} />
          {unavailable.length > 0 && <p className="mt-4 text-muted">{unavailable.length === 1 ? '1 saved game is' : `${unavailable.length} saved games are`} no longer available.</p>}
        </>
      )}
    </section>
  );
}

export function FavoritesPage() {
  usePageTitle('Favorites');
  const saved = useFavorites();
  const recent = useSyncExternalStore(recentlyPlayed.subscribe, recentlyPlayed.get, recentlyPlayed.get);
  return (
    <div className="wrap">
      <div className="page-title">
        <h1>Favorites</h1>
        <p className="text-muted">Saved in this browser only. NEXPLAY does not send these lists anywhere.</p>
      </div>
      <Section id="favorites-heading" title="Your favorites" slugs={saved} empty="Tap the heart on any game to save it here." action={saved.length > 0 ? <button type="button" className="btn btn-glass" onClick={() => favorites.clear()}>Clear favorites</button> : undefined} />
      <Section id="recent-heading" title="Recently played" slugs={recent} empty="Games you play will show up here." action={recent.length > 0 ? <button type="button" className="btn btn-glass" onClick={() => recentlyPlayed.clear()}>Clear recently played</button> : undefined} />
    </div>
  );
}
