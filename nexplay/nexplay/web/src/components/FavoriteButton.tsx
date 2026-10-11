import { useSyncExternalStore } from 'react';
import { cx } from '../lib/cx';
import { favorites } from '../lib/storage';
import { Icon } from './Icons';

export function useFavorites(): readonly string[] {
  return useSyncExternalStore(favorites.subscribe, favorites.get, favorites.get);
}

interface Props {
  slug: string;
  title: string;
  variant?: 'icon' | 'text';
  className?: string;
}

export function FavoriteButton({ slug, title, variant = 'icon', className }: Props) {
  const saved = useFavorites().includes(slug);
  const heart = <Icon name="heart" />;
  if (variant === 'text') {
    return (
      <button type="button" aria-pressed={saved} onClick={() => favorites.toggle(slug)} className={cx('btn btn-glass', saved && '[&_svg]:fill-neon-pink [&_svg]:stroke-neon-pink', className)}>
        {heart}
        {saved ? 'Saved' : 'Save'}
        <span className="sr-only"> {title} to favorites</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from favorites` : `Add ${title} to favorites`}
      onClick={() => favorites.toggle(slug)}
      className={cx('grid size-11 place-items-center rounded-full border border-white/25 bg-ink-950/55 text-white', saved && '[&_svg]:fill-neon-pink [&_svg]:stroke-neon-pink', className)}
    >
      {heart}
    </button>
  );
}
