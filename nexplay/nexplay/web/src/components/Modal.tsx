import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icons';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),iframe,[tabindex]:not([tabindex="-1"]):not([data-focus-guard])';

/** An accessible dialog: focus moves in, stays inside, Escape closes, and focus returns to where it came from. */
export function Modal({ title, onClose, children, wide = false }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = `modal-title-${title.replace(/\W+/g, '-').toLowerCase()}`;

  const focusables = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (focusables()[0] ?? panel.current)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      } else if (event.key === 'Tab') {
        const items = focusables();
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[200] grid place-items-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-ink-950/75" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`glass relative z-10 max-h-[90vh] w-full overflow-auto rounded-panel p-6 ${wide ? 'max-w-4xl' : 'max-w-lg'}`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-xl">
            {title}
          </h2>
          <button type="button" aria-label="Close" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-full border border-white/20 bg-white/[0.08]">
            <Icon name="close" />
          </button>
        </div>
        {children}
        {/* Key presses inside a game's frame never reach this page, so the Tab key cannot be trapped with a
            key handler alone. These two guards catch focus leaving either end and send it back inside. */}
        <span tabIndex={0} data-focus-guard="" onFocus={() => focusables().at(-1)?.focus()} className="absolute left-0 top-0 size-px outline-none" />
        <span tabIndex={0} data-focus-guard="" onFocus={() => focusables()[0]?.focus()} className="absolute bottom-0 left-0 size-px outline-none" />
      </div>
    </div>,
    document.body,
  );
}
