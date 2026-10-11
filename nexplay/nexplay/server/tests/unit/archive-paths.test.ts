import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkEntryName, isIgnorableEntry, resolveInside } from '../../src/lib/archive-paths.js';
import { GAME_PATH_RULES } from '../../src/lib/file-types.js';

const ok = (name: string) => checkEntryName(name, GAME_PATH_RULES);

describe('checkEntryName', () => {
  it('accepts ordinary game files and returns the normalized path', () => {
    expect(ok('index.html')).toEqual({ ok: true, path: 'index.html' });
    expect(ok('assets/img/hero.PNG')).toEqual({ ok: true, path: 'assets/img/hero.PNG' });
    expect(ok('js/')).toEqual({ ok: true, path: 'js' });
    expect(ok('My Sound (1).ogg')).toEqual({ ok: true, path: 'My Sound (1).ogg' });
    expect(ok('lib/phaser-3.80.1.min.js').ok).toBe(true);
  });

  it.each([
    ['../evil.js', 'relative path segment'],
    ['a/../../evil.js', 'relative path segment'],
    ['./index.html', 'relative path segment'],
    ['/etc/passwd.txt', 'absolute path'],
    ['C:/windows/x.js', 'absolute path'],
    ['a\\b.js', 'backslash'],
    ['a//b.js', 'empty path segment'],
    ['.env', 'hidden'],
    ['assets/.git/config.txt', 'hidden'],
    ['run.php', 'not allowed'],
    ['setup.exe', 'not allowed'],
    ['script.sh', 'not allowed'],
    ['game.js.map', 'not allowed'],
    ['README', 'without an extension'],
    ['file.txt:stream', 'unsupported character'],
    ['café.png', 'unsupported character'],
    ['a&b.js', 'unsupported character'],
    ['sounds/日本語.ogg', 'unsupported character'],
    ['bad name .js ', 'unsafe name'],
    ['dot.', 'unsafe name'],
    ['x\u0000.js', 'control character'],
    ['', 'empty path'],
  ])('rejects %j', (name, reason) => {
    const result = ok(name);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(reason);
  });

  it('rejects overly long and overly deep paths', () => {
    expect(ok('a'.repeat(250) + '.js').ok).toBe(false);
    expect(ok(Array(14).fill('d').join('/') + '/x.js').ok).toBe(false);
  });
});

describe('isIgnorableEntry', () => {
  it('skips archive-tool junk', () => {
    expect(isIgnorableEntry('__MACOSX/._index.html')).toBe(true);
    expect(isIgnorableEntry('assets/.DS_Store')).toBe(true);
    expect(isIgnorableEntry('index.html')).toBe(false);
  });
});

describe('resolveInside', () => {
  const root = path.resolve('/srv/games/abc');
  it('allows paths inside the root', () => {
    expect(resolveInside(root, 'a/b.js')).toBe(path.join(root, 'a', 'b.js'));
  });
  it('throws for anything that escapes', () => {
    expect(() => resolveInside(root, '../other/x.js')).toThrow();
    expect(() => resolveInside(root, '/etc/passwd')).toThrow();
    expect(() => resolveInside(root, 'a/../../x')).toThrow();
  });
});
