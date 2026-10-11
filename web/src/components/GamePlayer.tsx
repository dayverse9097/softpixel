import { useEffect, useRef, useState } from 'react';
import { isPlayUrl } from '../lib/urls';
import { Icon } from './Icons';

type Phase = 'checking' | 'loading' | 'ready' | 'failed';

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
}
interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface Props {
  url: string | null;
  title: string;
  /** Called once, when the game has loaded. */
  onStart?: () => void;
}

/**
 * Runs a game in a sandboxed frame. Games come from a different origin, get only the permissions listed
 * in the sandbox attribute (scripts and pointer lock), and the address is checked before it is loaded.
 */
export function GamePlayer({ url, title, onStart }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>('checking');
  const [reason, setReason] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const started = useRef(false);
  const safeUrl = isPlayUrl(url) ? url : null;

  const doc = document as FullscreenDocument;
  const canFullscreen = Boolean(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);

  // Step 1: confirm the game is reachable, so a missing build gives a clear message instead of a blank box.
  useEffect(() => {
    if (!safeUrl) {
      setPhase('failed');
      setReason('This game has an address the site does not trust, so it was not loaded.');
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15_000);
    setPhase('checking');
    fetch(safeUrl, { method: 'HEAD', credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!cancelled) setPhase('loading');
      })
      .catch(() => {
        if (cancelled) return;
        setPhase('failed');
        setReason('The game could not be reached. It may have been removed, or your connection dropped.');
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [safeUrl, attempt]);

  // Step 2: give up if the frame never finishes loading.
  useEffect(() => {
    if (phase !== 'loading') return;
    const timer = window.setTimeout(() => {
      setPhase('failed');
      setReason('The game took too long to start.');
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, [phase, attempt]);

  useEffect(() => {
    const onChange = () => {
      const element = doc.fullscreenElement ?? doc.webkitFullscreenElement;
      setFullscreen(element === stage.current);
      frame.current?.focus();
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
      if (doc.fullscreenElement ?? doc.webkitFullscreenElement) void (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc);
    };
  }, [doc]);

  const onLoad = () => {
    setPhase('ready');
    if (!started.current) {
      started.current = true;
      onStart?.();
    }
    const active = document.activeElement;
    if (!active || active === document.body || active.tagName === 'H1') frame.current?.focus();
  };

  const toggleFullscreen = () => {
    const element = stage.current as FullscreenElement | null;
    if (!element) return;
    const active = doc.fullscreenElement ?? doc.webkitFullscreenElement;
    const result = active ? (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc) : (element.requestFullscreen ?? element.webkitRequestFullscreen)?.call(element);
    if (result && typeof (result as Promise<void>).catch === 'function') (result as Promise<void>).catch(() => undefined);
  };

  const showFrame = safeUrl && (phase === 'loading' || phase === 'ready');

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-glass" onClick={() => setAttempt((a) => a + 1)}>
          <Icon name="refresh" />
          Restart
        </button>
        {canFullscreen && (
          <button type="button" className="btn btn-glass" aria-pressed={fullscreen} onClick={toggleFullscreen}>
            <Icon name={fullscreen ? 'shrink' : 'expand'} />
            {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
        )}
      </div>
      <div
        ref={stage}
        className="relative h-[clamp(380px,68vh,720px)] w-full overflow-hidden rounded-panel border border-white/20 bg-ink-950 shadow-glass supports-[height:1dvh]:h-[clamp(380px,68dvh,720px)] focus-within:ring-2 focus-within:ring-neon-cyan/60 [&:fullscreen]:h-full [&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:-webkit-full-screen]:h-full [&:-webkit-full-screen]:rounded-none [&:-webkit-full-screen]:border-0"
      >
        {showFrame && (
          <iframe
            key={attempt}
            ref={frame}
            src={safeUrl}
            title={`${title} (game)`}
            sandbox="allow-scripts allow-pointer-lock"
            referrerPolicy="no-referrer"
            onLoad={onLoad}
            className="absolute inset-0 block h-full w-full border-0 bg-ink-950"
          />
        )}
        {(phase === 'checking' || phase === 'loading') && (
          <div role="status" className="absolute inset-0 z-[2] grid place-content-center justify-items-center gap-3 bg-ink-950/85 p-6 text-center">
            <i aria-hidden="true" className="size-9 animate-spin rounded-full border-[3px] border-white/20 border-t-neon-cyan" />
            <p>Loading {title}…</p>
          </div>
        )}
        {phase === 'failed' && (
          <div role="alert" className="absolute inset-0 z-[2] grid place-content-center justify-items-center gap-3 bg-ink-950/90 p-6 text-center">
            <h2 className="text-xl">This game didn’t load.</h2>
            <p className="max-w-sm text-muted">{reason}</p>
            <button type="button" className="btn btn-primary" onClick={() => setAttempt((a) => a + 1)}>
              <Icon name="refresh" />
              Try again
            </button>
          </div>
        )}
      </div>
      <p className="mt-3.5 text-muted">Click the game once so it can use your keyboard. Press Tab to move out of it.</p>
    </div>
  );
}
