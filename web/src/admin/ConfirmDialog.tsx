import { useState, type FormEvent } from 'react';
import { Modal } from '../components/Modal';

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  /** When set, the person must type this exact text before the button works (used for deleting a game). */
  requireText?: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/** Confirmation for destructive actions. Failures are shown in the dialog so nothing happens silently. */
export function ConfirmDialog({ title, message, confirmLabel, requireText, onConfirm, onClose }: Props) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = !requireText || typed === requireText;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Please try again.');
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <p className="text-muted">{message}</p>
        {requireText && (
          <div>
            <label htmlFor="confirm-text" className="label">
              Type <strong>{requireText}</strong> to confirm
            </label>
            <input id="confirm-text" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
          </div>
        )}
        {error && (
          <p role="alert" className="error-text !mt-0">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" className="btn btn-glass" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" disabled={!ready || busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
