import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';

export function NotFoundPage({ title = 'That page isn’t here.', message = 'The link may be old, or the game may have been removed.' }: { title?: string; message?: string }) {
  usePageTitle('Page not found');
  return (
    <div className="wrap">
      <div className="glass mx-auto mt-14 grid max-w-xl justify-items-center gap-3.5 rounded-panel p-9 text-center">
        <h1 className="text-2xl">{title}</h1>
        <p className="text-muted">{message}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/" className="btn btn-primary">
            Back to home
          </Link>
          <Link to="/discover" className="btn btn-glass">
            Discover games
          </Link>
        </div>
      </div>
    </div>
  );
}
