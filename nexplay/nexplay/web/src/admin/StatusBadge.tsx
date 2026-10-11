import type { GameStatus } from '../lib/types';

const STYLES: Record<GameStatus, string> = {
  DRAFT: 'tag tag-muted',
  PUBLISHED: 'tag tag-mint',
  ARCHIVED: 'tag tag-gold',
};

const LABELS: Record<GameStatus, string> = { DRAFT: 'Draft', PUBLISHED: 'Published', ARCHIVED: 'Archived' };

export function StatusBadge({ status }: { status: GameStatus }) {
  return <span className={STYLES[status]}>{LABELS[status]}</span>;
}
