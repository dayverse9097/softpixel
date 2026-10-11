import { describe, expect, it } from 'vitest';
import { checkSignature, contentTypeFor, sniffImage } from '../../src/lib/file-types.js';

const bytes = (...n: number[]) => Uint8Array.from(n);
const text = (s: string) => new TextEncoder().encode(s);

describe('checkSignature', () => {
  it('accepts real PNG, JPEG, WASM and WebP headers', () => {
    expect(checkSignature('png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)).ok).toBe(true);
    expect(checkSignature('jpg', bytes(0xff, 0xd8, 0xff, 0xe0)).ok).toBe(true);
    expect(checkSignature('wasm', bytes(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0)).ok).toBe(true);
    expect(checkSignature('webp', Uint8Array.from([...text('RIFF'), 1, 2, 3, 4, ...text('WEBP')])).ok).toBe(true);
  });

  it('rejects an executable renamed to an image or font', () => {
    const exe = bytes(0x4d, 0x5a, 0x90, 0x00, 0x03);
    expect(checkSignature('png', exe).ok).toBe(false);
    expect(checkSignature('woff2', exe).ok).toBe(false);
    expect(checkSignature('wasm', exe).ok).toBe(false);
  });

  it('requires text types to be valid UTF-8 without NUL bytes', () => {
    expect(checkSignature('js', text('console.log("héllo");')).ok).toBe(true);
    expect(checkSignature('html', text('')).ok).toBe(true);
    expect(checkSignature('js', bytes(0x4d, 0x5a, 0x00, 0x00)).ok).toBe(false);
    expect(checkSignature('css', bytes(0xff, 0xfe, 0xfd)).ok).toBe(false);
  });

  it('tolerates a multi-byte character cut at the end of the sample', () => {
    const full = text('ab€');
    expect(checkSignature('txt', full.slice(0, full.length - 1)).ok).toBe(true);
  });

  it('does not inspect opaque engine formats', () => {
    expect(checkSignature('pck', bytes(1, 2, 3)).ok).toBe(true);
  });
});

describe('sniffImage', () => {
  it('identifies images by content, not name', () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xdb))).toBe('jpg');
    expect(sniffImage(text('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });
});

describe('contentTypeFor', () => {
  it('maps known extensions and falls back safely', () => {
    expect(contentTypeFor('html')).toBe('text/html; charset=utf-8');
    expect(contentTypeFor('wasm')).toBe('application/wasm');
    expect(contentTypeFor('unknown')).toBe('application/octet-stream');
  });
});
