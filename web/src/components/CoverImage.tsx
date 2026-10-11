import { useState } from 'react';
import { cx } from '../lib/cx';
import { isCoverUrl } from '../lib/urls';
import type { GameSummary } from '../lib/types';
import { PlaceholderArt } from './PlaceholderArt';

/** Cover art box with a fixed shape, so the page does not jump while images load. */
export function CoverImage({ game, className }: { game: Pick<GameSummary, 'slug' | 'coverUrl'>; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = isCoverUrl(game.coverUrl) ? game.coverUrl : null;
  return (
    <div className={cx('relative aspect-[16/10] overflow-hidden rounded-inner bg-ink-900', className)}>
      {src && !failed ? (
        <img
          src={src}
          alt=""
          width={640}
          height={400}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <PlaceholderArt seed={game.slug} />
      )}
    </div>
  );
}
