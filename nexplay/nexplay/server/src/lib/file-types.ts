import type { PathRules } from './archive-paths.js';

/** Content types the game host will serve. Anything else is rejected at upload and never served. */
export const CONTENT_TYPES: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  wasm: 'application/wasm',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'video/webm',
  mp4: 'video/mp4',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  glb: 'model/gltf-binary',
  pck: 'application/octet-stream', // Godot resource pack
  data: 'application/octet-stream', // Unity WebGL data
  bin: 'application/octet-stream',
};

export const GAME_PATH_RULES: PathRules = {
  maxPathLength: 200,
  maxDepth: 12,
  allowedExtensions: new Set(Object.keys(CONTENT_TYPES)),
};

export function contentTypeFor(ext: string): string {
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

const TEXT_EXTENSIONS = new Set(['html', 'js', 'mjs', 'css', 'json', 'txt', 'svg']);

function startsWith(head: Uint8Array, bytes: number[], offset = 0): boolean {
  if (head.length < offset + bytes.length) return false;
  return bytes.every((b, i) => head[offset + i] === b);
}

function ascii(text: string): number[] {
  return Array.from(text, (c) => c.charCodeAt(0));
}

const SIGNATURES: Readonly<Record<string, (h: Uint8Array) => boolean>> = {
  png: (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpg: (h) => startsWith(h, [0xff, 0xd8, 0xff]),
  jpeg: (h) => startsWith(h, [0xff, 0xd8, 0xff]),
  gif: (h) => startsWith(h, ascii('GIF8')),
  webp: (h) => startsWith(h, ascii('RIFF')) && startsWith(h, ascii('WEBP'), 8),
  wav: (h) => startsWith(h, ascii('RIFF')) && startsWith(h, ascii('WAVE'), 8),
  wasm: (h) => startsWith(h, [0x00, 0x61, 0x73, 0x6d]),
  woff: (h) => startsWith(h, ascii('wOFF')),
  woff2: (h) => startsWith(h, ascii('wOF2')),
  ttf: (h) => startsWith(h, [0x00, 0x01, 0x00, 0x00]) || startsWith(h, ascii('true')),
  otf: (h) => startsWith(h, ascii('OTTO')),
  ogg: (h) => startsWith(h, ascii('OggS')),
  mp3: (h) => startsWith(h, ascii('ID3')) || (h.length >= 2 && h[0] === 0xff && ((h[1] ?? 0) & 0xe0) === 0xe0),
  webm: (h) => startsWith(h, [0x1a, 0x45, 0xdf, 0xa3]),
  mp4: (h) => startsWith(h, ascii('ftyp'), 4),
  ico: (h) => startsWith(h, [0x00, 0x00, 0x01, 0x00]),
  glb: (h) => startsWith(h, ascii('glTF')),
};

function looksLikeUtf8Text(head: Uint8Array): boolean {
  if (head.includes(0)) return false;
  try {
    // stream:true tolerates a multi-byte character cut off at the end of the sample
    new TextDecoder('utf-8', { fatal: true }).decode(head, { stream: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check the first bytes of a file against what its extension claims.
 * Text types must be valid UTF-8 without NUL bytes. Known binary types must carry their magic number.
 * Opaque engine formats (pck, data, bin) have no check beyond the extension allowlist.
 */
export function checkSignature(ext: string, head: Uint8Array): { ok: boolean; reason?: string } {
  if (TEXT_EXTENSIONS.has(ext)) {
    return looksLikeUtf8Text(head) ? { ok: true } : { ok: false, reason: 'content is not valid text' };
  }
  const check = SIGNATURES[ext];
  if (!check) return { ok: true };
  return check(head) ? { ok: true } : { ok: false, reason: `content does not look like a .${ext} file` };
}

/** Identify an image by its first bytes (never by its filename). */
export function sniffImage(head: Uint8Array): 'png' | 'jpg' | 'webp' | null {
  if (SIGNATURES['png']?.(head)) return 'png';
  if (SIGNATURES['jpg']?.(head)) return 'jpg';
  if (SIGNATURES['webp']?.(head)) return 'webp';
  return null;
}
