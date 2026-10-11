import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GamePlayer } from '../components/GamePlayer';
import { Icon } from '../components/Icons';
import { Modal } from '../components/Modal';
import { ErrorState, Spinner } from '../components/States';
import { useApi } from '../hooks/useApi';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError, isAbort } from '../lib/api';
import { adminApi, uploadVersion } from '../lib/adminApi';
import { formatBytes, formatDate } from '../lib/format';
import type { AdminGameDetail, VersionSummary } from '../lib/types';
import { ConfirmDialog } from './ConfirmDialog';
import { GameForm } from './GameForm';
import { StatusBadge } from './StatusBadge';

function Panel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="glass mt-6 rounded-panel panel-pad">
      <h2 id={id} className="mb-4 text-lg">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function GameEditorPage() {
  const { id } = useParams();
  return id ? <EditGame id={id} /> : <CreateGame />;
}

function CreateGame() {
  usePageTitle('New game');
  const navigate = useNavigate();
  return (
    <div>
      <div className="page-title">
        <h1>New game</h1>
        <p className="text-muted">Add the details first. You can upload the game and a cover image on the next screen.</p>
      </div>
      <Panel id="details-heading" title="Details">
        <GameForm
          submitLabel="Create game"
          onSubmit={async (input) => {
            const game = await adminApi.createGame(input);
            navigate(`/admin/games/${game.id}`, { replace: true });
          }}
        />
      </Panel>
    </div>
  );
}

function EditGame({ id }: { id: string }) {
  const game = useApi((signal) => adminApi.getGame(id, signal), [id]);
  usePageTitle(game.data?.title ?? 'Edit game');
  if (game.error) return <div className="pt-10"><ErrorState error={game.error} onRetry={game.reload} title="This game didn’t load" /></div>;
  if (!game.data) return <div className="pt-10"><Spinner label="Loading game" /></div>;
  return <Editor game={game.data} reload={game.reload} />;
}

function Editor({ game, reload }: { game: AdminGameDetail; reload: () => void }) {
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<null | { kind: 'delete-game' } | { kind: 'delete-version'; version: VersionSummary } | { kind: 'archive' }>(null);
  const [preview, setPreview] = useState<null | { url: string; label: string }>(null);
  const navigate = useNavigate();

  const run = async (action: () => Promise<unknown>, success: string) => {
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(success);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Please try again.');
    }
  };

  const openPreview = async (version: VersionSummary) => {
    setError('');
    try {
      const { url } = await adminApi.previewUrl(game.id, version.id);
      setPreview({ url, label: `${game.title} ${version.version}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the preview.');
    }
  };

  return (
    <div>
      <div className="page-title flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>{game.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2.5 text-muted">
            <StatusBadge status={game.status} />
            <span>/{game.slug}</span>
            {game.status === 'PUBLISHED' && (
              <Link to={`/game/${game.slug}`} className="font-semibold text-neon-cyan">
                View on site
              </Link>
            )}
          </p>
        </div>
      </div>

      <div aria-live="polite">
        {notice && <p role="status" className="mt-4 rounded-inner border border-neon-mint/40 bg-neon-mint/10 px-4 py-3 text-neon-mint">{notice}</p>}
        {error && <p role="alert" className="mt-4 rounded-inner border border-red-300/50 bg-red-500/10 px-4 py-3 text-red-200">{error}</p>}
      </div>

      <Panel id="details-heading" title="Details">
        <GameForm
          initial={game}
          submitLabel="Save changes"
          onSubmit={async (input) => {
            await adminApi.updateGame(game.id, input);
            reload();
          }}
        />
      </Panel>

      <CoverPanel game={game} onDone={(text) => { setNotice(text); reload(); }} />

      <Panel id="builds-heading" title="Game builds">
        <UploadForm gameId={game.id} suggestion={suggestNext(game.versions)} onUploaded={(v) => { setNotice(`Uploaded version ${v.version}. Preview it, then publish it when you are ready.`); setError(''); reload(); }} />
        <ul className="m-0 mt-6 grid list-none gap-3 p-0">
          {game.versions.length === 0 && <li className="text-muted">No builds uploaded yet.</li>}
          {game.versions.map((v) => {
            const live = game.status === 'PUBLISHED' && game.currentVersionId === v.id;
            return (
              <li key={v.id} className="surface grid items-center gap-3 rounded-card p-4 md:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <strong>Version {v.version}</strong>
                    {live && <span className="tag tag-mint">Live</span>}
                    {game.currentVersionId === v.id && !live && <span className="tag tag-muted">Selected</span>}
                  </div>
                  <p className="mt-1 text-sm text-faint">
                    {v.fileCount} files · {formatBytes(v.totalBytes)} · {formatDate(v.createdAt, true)} · {v.scanned ? 'Malware scanned' : 'Not malware scanned'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <button type="button" className="btn btn-glass" onClick={() => openPreview(v)} aria-label={`Preview version ${v.version}`}>
                    <Icon name="play" />
                    Preview
                  </button>
                  {!live && game.status !== 'ARCHIVED' && (
                    <button type="button" className="btn btn-primary" onClick={() => run(() => adminApi.publish(game.id, v.id), `Version ${v.version} is now live.`)} aria-label={`Publish version ${v.version}`}>
                      Publish
                    </button>
                  )}
                  {!live && game.currentVersionId !== v.id && (
                    <button type="button" className="btn btn-glass" onClick={() => setConfirm({ kind: 'delete-version', version: v })} aria-label={`Delete version ${v.version}`}>
                      <Icon name="trash" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel id="publishing-heading" title="Publishing">
        <p className="mb-4 text-muted">
          {game.status === 'PUBLISHED' && 'This game is visible to everyone.'}
          {game.status === 'DRAFT' && 'This game is a draft. Only administrators can see it. Publish a build above to make it public.'}
          {game.status === 'ARCHIVED' && 'This game is archived and hidden from the site.'}
        </p>
        <div className="flex flex-wrap gap-3">
          {game.status === 'PUBLISHED' && (
            <button type="button" className="btn btn-glass" onClick={() => run(() => adminApi.setState(game.id, 'unpublish'), 'The game is now a draft.')}>
              Unpublish
            </button>
          )}
          {game.status !== 'ARCHIVED' ? (
            <button type="button" className="btn btn-glass" onClick={() => setConfirm({ kind: 'archive' })}>
              Archive
            </button>
          ) : (
            <button type="button" className="btn btn-glass" onClick={() => run(() => adminApi.setState(game.id, 'unarchive'), 'The game was restored as a draft.')}>
              Restore from archive
            </button>
          )}
          <button type="button" className="btn btn-danger" onClick={() => setConfirm({ kind: 'delete-game' })}>
            <Icon name="trash" />
            Delete game
          </button>
        </div>
      </Panel>

      {confirm?.kind === 'delete-game' && (
        <ConfirmDialog
          title="Delete this game?"
          message="This permanently deletes the game, all of its builds and its cover image. It cannot be undone."
          confirmLabel="Delete game"
          requireText={game.slug}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await adminApi.deleteGame(game.id, game.slug);
            navigate('/admin', { replace: true });
          }}
        />
      )}
      {confirm?.kind === 'archive' && (
        <ConfirmDialog
          title="Archive this game?"
          message="It will disappear from the public site. You can restore it later."
          confirmLabel="Archive"
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await adminApi.setState(game.id, 'archive');
            setNotice('The game was archived.');
            reload();
          }}
        />
      )}
      {confirm?.kind === 'delete-version' && (
        <ConfirmDialog
          title={`Delete version ${confirm.version.version}?`}
          message="The uploaded files for this build are removed permanently."
          confirmLabel="Delete version"
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await adminApi.deleteVersion(game.id, confirm.version.id);
            setNotice(`Version ${confirm.version.version} was deleted.`);
            reload();
          }}
        />
      )}
      {preview && (
        <Modal title={`Preview: ${preview.label}`} onClose={() => setPreview(null)} wide>
          <GamePlayer url={preview.url} title={preview.label} />
        </Modal>
      )}
    </div>
  );
}

function suggestNext(versions: VersionSummary[]): string {
  if (versions.length === 0) return '1.0.0';
  const parts = (versions[0]?.version ?? '').split('.').map(Number);
  if (parts.length === 3 && parts.every((n) => Number.isInteger(n))) return `${parts[0]}.${parts[1]}.${(parts[2] ?? 0) + 1}`;
  return '';
}

function CoverPanel({ game, onDone }: { game: AdminGameDetail; onDone: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [broken, setBroken] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.uploadCover(game.id, file);
      setFile(null);
      if (input.current) input.current.value = '';
      setVersion((v) => v + 1);
      setBroken(false);
      onDone('Cover image updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the image.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel id="cover-heading" title="Cover image">
      <div className="grid items-start gap-6 md:grid-cols-[240px_1fr]">
        <div className="aspect-[16/10] overflow-hidden rounded-inner bg-white/[0.06]">
          {game.hasCover && !broken ? (
            <img src={adminApi.coverUrl(game.id, `${game.updatedAt}-${version}`)} alt={`Current cover for ${game.title}`} className="h-full w-full object-cover" onError={() => setBroken(true)} />
          ) : (
            <div className="grid h-full place-items-center p-3 text-center text-sm text-faint">No cover yet. A generated picture is used instead.</div>
          )}
        </div>
        <form onSubmit={submit} className="grid gap-3">
          <div>
            <label htmlFor="cover-file" className="label">Choose a PNG, JPEG or WebP image (up to 2 MB)</label>
            <input id="cover-file" ref={input} className="input !py-2" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          {error && <p role="alert" className="error-text !mt-0">{error}</p>}
          <div>
            <button type="submit" className="btn btn-glass" disabled={!file || busy}>
              <Icon name="upload" />
              {busy ? 'Uploading…' : 'Upload cover'}
            </button>
          </div>
        </form>
      </div>
    </Panel>
  );
}

function UploadForm({ gameId, suggestion, onUploaded }: { gameId: string; suggestion: string; onUploaded: (v: VersionSummary) => void }) {
  const [label, setLabel] = useState(suggestion);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const uploading = progress !== null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setError('');
    setProgress(0);
    controller.current = new AbortController();
    try {
      const created = await uploadVersion(gameId, file, label.trim(), setProgress, controller.current.signal);
      setFile(null);
      if (input.current) input.current.value = '';
      onUploaded(created);
    } catch (err) {
      if (!isAbort(err)) setError(err instanceof ApiError ? err.message : 'The upload failed. Please try again.');
    } finally {
      setProgress(null);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <p className="text-muted">
        Upload your game as a ZIP file with <code className="rounded bg-white/10 px-1.5">index.html</code> at the top level. Every file is checked before anything is saved, and nothing goes live until you publish it.
      </p>
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <div>
          <label htmlFor="build-version" className="label">Version label</label>
          <input id="build-version" className="input" required maxLength={32} value={label} onChange={(e) => setLabel(e.target.value)} disabled={uploading} />
        </div>
        <div>
          <label htmlFor="build-file" className="label">Game ZIP</label>
          <input id="build-file" ref={input} className="input !py-2" type="file" accept=".zip,application/zip" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={uploading} />
        </div>
      </div>
      {uploading && (
        <div>
          <progress className="h-3 w-full accent-neon-cyan" value={Math.round((progress ?? 0) * 100)} max={100} aria-label="Upload progress" />
          <p role="status" className="help">
            {progress !== null && progress >= 1 ? 'Checking the files…' : `Uploading… ${Math.round((progress ?? 0) * 100)}%`}
          </p>
        </div>
      )}
      {error && <p role="alert" className="error-text !mt-0">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primary" disabled={!file || !label.trim() || uploading}>
          <Icon name="upload" />
          Upload build
        </button>
        {uploading && (
          <button type="button" className="btn btn-glass" onClick={() => controller.current?.abort()}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
