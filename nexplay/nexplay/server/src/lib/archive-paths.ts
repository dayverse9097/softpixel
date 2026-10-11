import path from 'node:path';

export interface PathRules {
  maxPathLength: number;
  maxDepth: number;
  allowedExtensions: ReadonlySet<string>;
}

export type PathCheck = { ok: true; path: string } | { ok: false; reason: string };

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const WINDOWS_DRIVE = /^[a-zA-Z]:/;
// Letters, digits, space and . _ - ( ) + , = @ ~ only. Accented letters and symbols are refused up front,
// so a name can never be accepted here and then fail later when it is stored or served.
const SAFE_NAME = /^[A-Za-z0-9 ._()+,=@~-]+$/;

function no(reason: string): PathCheck {
  return { ok: false, reason };
}

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return '';
  return fileName.slice(dot + 1).toLowerCase();
}

/** Files that archive tools add automatically. They are skipped, not stored. */
export function isIgnorableEntry(name: string): boolean {
  return (
    name.startsWith('__MACOSX/') ||
    name === '.DS_Store' ||
    name.endsWith('/.DS_Store') ||
    name === 'Thumbs.db' ||
    name.endsWith('/Thumbs.db')
  );
}

/**
 * Decide whether an archive entry name (or a URL path) is safe to store or serve.
 * Returns the normalized relative path, or the reason it was rejected.
 */
export function checkEntryName(raw: string, rules: PathRules): PathCheck {
  if (raw.length === 0) return no('empty path');
  if (CONTROL_CHARS.test(raw)) return no('control character in path');
  if (raw.includes('\\')) return no('backslash in path');
  if (raw.startsWith('/') || WINDOWS_DRIVE.test(raw)) return no('absolute path');

  const name = raw.normalize('NFC');
  if (name.length > rules.maxPathLength) return no('path too long');

  const isDirectory = name.endsWith('/');
  const parts = (isDirectory ? name.slice(0, -1) : name).split('/');
  if (parts.length > rules.maxDepth) return no('path too deep');

  for (const part of parts) {
    if (part === '') return no('empty path segment');
    if (part === '.' || part === '..') return no('relative path segment');
    if (part.startsWith('.')) return no('hidden file or folder');
    if (part !== part.trim() || part.endsWith('.')) return no('unsafe name');
    if (!SAFE_NAME.test(part)) return no('unsupported character in name (use plain letters, numbers and . _ -)');
  }

  const normalized = parts.join('/');
  if (isDirectory) return { ok: true, path: normalized };

  const ext = extensionOf(parts[parts.length - 1] ?? '');
  if (!ext || !rules.allowedExtensions.has(ext)) {
    return no(ext ? `file type .${ext} is not allowed` : 'files without an extension are not allowed');
  }
  return { ok: true, path: normalized };
}

/** Join a relative path onto a root and refuse anything that would land outside it. */
export function resolveInside(root: string, relative: string): string {
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error('path escapes its root');
  }
  return target;
}
