import { useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from '../components/Icons';
import { ApiError } from '../lib/api';
import type { AdminGame, Control, GameInput } from '../lib/types';

interface Props {
  initial?: AdminGame;
  submitLabel: string;
  onSubmit: (input: GameInput) => Promise<void>;
}

const MAX_CONTROLS = 12;

function Field({ id, label, help, error, children }: { id: string; label: string; help?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {help && !error && (
        <p id={`${id}-help`} className="help">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}

/** Create or edit a game's text details. Field errors from the server are shown next to the field they belong to. */
export function GameForm({ initial, submitLabel, onSubmit }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const [controls, setControls] = useState<Control[]>(initial?.controls ?? []);
  const [featured, setFeatured] = useState(initial?.featured ?? false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const describedBy = (id: string, help = false) => (issues[id] ? `${id}-error` : help ? `${id}-help` : undefined);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setIssues({});
    setMessage(null);
    try {
      await onSubmit({
        title: title.trim(),
        slug: slug.trim() || undefined,
        category: category.trim(),
        description: description.trim(),
        instructions: instructions.trim(),
        controls: controls.filter((c) => c.input.trim() || c.action.trim()).map((c) => ({ input: c.input.trim(), action: c.action.trim() })),
        featured,
      });
      setMessage({ kind: 'ok', text: 'Saved.' });
    } catch (err) {
      if (err instanceof ApiError && err.issues.length > 0) {
        const byField: Record<string, string> = {};
        for (const issue of err.issues) byField[issue.path.split('.')[0] ?? 'form'] ??= issue.message;
        setIssues(byField);
        setMessage({ kind: 'error', text: 'Please fix the highlighted fields.' });
      } else {
        setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Could not save. Please try again.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const setControl = (index: number, patch: Partial<Control>) => setControls((list) => list.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="title" label="Title" error={issues.title}>
          <input id="title" className="input" required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={Boolean(issues.title)} aria-describedby={describedBy('title')} />
        </Field>
        <Field id="category" label="Category" error={issues.category} help="For example Arcade, Puzzle or Casual.">
          <input id="category" className="input" required maxLength={40} value={category} onChange={(e) => setCategory(e.target.value)} aria-invalid={Boolean(issues.category)} aria-describedby={describedBy('category', true)} />
        </Field>
      </div>
      <Field id="slug" label="URL name" error={issues.slug} help={initial ? 'Changing this changes the game’s web address.' : 'Leave empty to make one from the title. Lowercase letters, numbers and hyphens.'}>
        <input id="slug" className="input" maxLength={60} value={slug} onChange={(e) => setSlug(e.target.value)} autoCapitalize="off" spellCheck={false} aria-invalid={Boolean(issues.slug)} aria-describedby={describedBy('slug', true)} />
      </Field>
      <Field id="description" label="Description" error={issues.description} help="Shown on cards and the game page. Plain text only.">
        <textarea id="description" className="textarea" required maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} aria-invalid={Boolean(issues.description)} aria-describedby={describedBy('description', true)} />
      </Field>
      <Field id="instructions" label="How to play" error={issues.instructions}>
        <textarea id="instructions" className="textarea" maxLength={2000} value={instructions} onChange={(e) => setInstructions(e.target.value)} aria-invalid={Boolean(issues.instructions)} aria-describedby={describedBy('instructions')} />
      </Field>

      <fieldset className="m-0 border-0 p-0">
        <legend className="label">Controls</legend>
        {issues.controls && <p className="error-text mb-2">{issues.controls}</p>}
        <div className="grid gap-3">
          {controls.map((control, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
              <div>
                <label htmlFor={`control-input-${index}`} className="label">Input {index + 1}</label>
                <input id={`control-input-${index}`} className="input" maxLength={40} placeholder="Mouse" value={control.input} onChange={(e) => setControl(index, { input: e.target.value })} />
              </div>
              <div>
                <label htmlFor={`control-action-${index}`} className="label">Action {index + 1}</label>
                <input id={`control-action-${index}`} className="input" maxLength={80} placeholder="Move the paddle" value={control.action} onChange={(e) => setControl(index, { action: e.target.value })} />
              </div>
              <button type="button" className="btn btn-glass !px-3" aria-label={`Remove control ${index + 1}`} onClick={() => setControls((list) => list.filter((_, i) => i !== index))}>
                <Icon name="trash" />
              </button>
            </div>
          ))}
        </div>
        {controls.length < MAX_CONTROLS && (
          <button type="button" className="btn btn-glass mt-3" onClick={() => setControls((list) => [...list, { input: '', action: '' }])}>
            <Icon name="plus" />
            Add a control
          </button>
        )}
      </fieldset>

      <label className="flex min-h-[44px] items-center gap-3">
        <input type="checkbox" className="size-5 accent-neon-violet" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
        <span>Feature this game on the home page</span>
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        {message && (
          <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'text-red-200' : 'text-neon-mint'}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
