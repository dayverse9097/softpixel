import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { GameSummary } from '../lib/types';
import { CoverImage } from './CoverImage';
import { FavoriteButton } from './FavoriteButton';
import { Icon } from './Icons';

export function PlayLink({ game, className = 'btn btn-primary' }: { game: Pick<GameSummary, 'slug' | 'title'>; className?: string }) {
  return (
    <Link to={`/play/${game.slug}`} className={className} aria-label={`Play ${game.title}`}>
      <Icon name="play" />
      Play
    </Link>
  );
}

/** Game text comes from the API as plain text and is rendered as text only, never as HTML. */
export function GameCard({ game }: { game: GameSummary }) {
  return (
    <motion.article className="surface flex flex-col gap-3 rounded-card p-2.5" whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 320, damping: 24 }}>
      <div className="relative">
        <CoverImage game={game} />
        <FavoriteButton slug={game.slug} title={game.title} className="absolute right-2 top-2" />
      </div>
      <div className="flex flex-1 flex-col gap-2.5 px-2 pb-2">
        <span className="tag">{game.category}</span>
        <h3 className="text-[1.02rem]">
          <Link to={`/game/${game.slug}`} className="no-underline">
            {game.title}
          </Link>
        </h3>
        <p className="line-clamp-2 text-[0.95rem] text-muted">{game.description}</p>
        <div className="mt-auto flex flex-wrap gap-3 pt-1">
          <PlayLink game={game} className="btn btn-primary flex-1" />
          <Link to={`/game/${game.slug}`} className="btn btn-glass" aria-label={`Details for ${game.title}`}>
            Details
          </Link>
        </div>
      </div>
    </motion.article>
  );
}

export function GameGrid({ games }: { games: readonly GameSummary[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
      {games.map((game) => (
        <GameCard key={game.slug} game={game} />
      ))}
    </div>
  );
}
