import { Icon } from './Icons';

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-center gap-4">
      <button type="button" className="btn btn-glass" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <Icon name="back" />
        Previous
      </button>
      <span aria-live="polite" className="text-muted">
        Page {page} of {pages}
      </span>
      <button type="button" className="btn btn-glass" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}
