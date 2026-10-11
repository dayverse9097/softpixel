import fs from 'node:fs';
import { mkdir, open, stat } from 'node:fs/promises';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import type { Config } from './config.js';
import { UploadRejected } from './errors.js';
import { checkEntryName, extensionOf, isIgnorableEntry, resolveInside, type PathRules } from './lib/archive-paths.js';
import { checkSignature } from './lib/file-types.js';

const MB = 1024 * 1024;

export interface ExtractLimits {
  maxArchiveBytes: number;
  maxUnpackedBytes: number;
  maxFileBytes: number;
  maxFiles: number;
  maxRatio: number;
  timeoutMs: number;
}

export interface ExtractedFile {
  path: string;
  absPath: string;
  size: number;
  ext: string;
}

export interface ExtractResult {
  files: ExtractedFile[];
  totalBytes: number;
}

export function limitsFromConfig(config: Config): ExtractLimits {
  return {
    maxArchiveBytes: config.MAX_ARCHIVE_MB * MB,
    maxUnpackedBytes: config.MAX_UNPACKED_MB * MB,
    maxFileBytes: config.MAX_FILE_MB * MB,
    maxFiles: config.MAX_FILES,
    maxRatio: config.MAX_COMPRESSION_RATIO,
    timeoutMs: config.EXTRACT_TIMEOUT_SECONDS * 1000,
  };
}

function printable(name: string): string {
  return name.slice(0, 80).replace(/[^\x20-\x7e]/g, '?');
}

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: true, decodeStrings: true, validateEntrySizes: true }, (err, zip) => {
      if (err || !zip) reject(new UploadRejected('invalid_archive', 'The file is not a valid ZIP archive.'));
      else resolve(zip);
    });
  });
}

async function* entriesOf(zip: yauzl.ZipFile): AsyncGenerator<yauzl.Entry> {
  for (;;) {
    const next = await new Promise<yauzl.Entry | null>((resolve, reject) => {
      const onEntry = (e: yauzl.Entry) => (cleanup(), resolve(e));
      const onEnd = () => (cleanup(), resolve(null));
      const onError = (err: Error) => (cleanup(), reject(err));
      const cleanup = () => {
        zip.off('entry', onEntry);
        zip.off('end', onEnd);
        zip.off('error', onError);
      };
      zip.once('entry', onEntry);
      zip.once('end', onEnd);
      zip.once('error', onError);
      zip.readEntry();
    });
    if (!next) return;
    yield next;
  }
}

function openEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => (err || !stream ? reject(err ?? new Error('no stream')) : resolve(stream)));
  });
}

/** Count bytes as they are written, so a lying ZIP header cannot slip a bomb past the declared sizes. */
function budget(state: { total: number }, limits: ExtractLimits): Transform {
  let fileBytes = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      fileBytes += chunk.length;
      state.total += chunk.length;
      if (fileBytes > limits.maxFileBytes) return callback(new UploadRejected('file_too_large', 'A file in the archive is too large.'));
      if (state.total > limits.maxUnpackedBytes) return callback(new UploadRejected('archive_too_large', 'The unpacked game is too large.'));
      callback(null, chunk);
    },
  });
}

function rejectSpecialEntry(entry: yauzl.Entry): void {
  if (entry.isEncrypted()) throw new UploadRejected('encrypted_entry', 'Encrypted ZIP entries are not allowed.');
  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
    throw new UploadRejected('unsupported_compression', 'Only stored and deflate compression are supported.');
  }
  // Unix hosts store the file type in the high bits of the external attributes.
  if (entry.versionMadeBy >> 8 === 3) {
    const type = ((entry.externalFileAttributes >>> 16) & 0xffff) & 0o170000;
    if (type !== 0 && type !== 0o100000 && type !== 0o040000) {
      throw new UploadRejected('unsafe_entry', 'Symbolic links and special files are not allowed.');
    }
  }
}

/**
 * Unpack a game ZIP into destDir after checking every entry. Nothing is trusted: names, sizes,
 * types and contents are all validated, and any problem rejects the whole archive.
 * The caller owns destDir and must delete it afterwards.
 */
export async function extractGameArchive(
  zipPath: string,
  destDir: string,
  limits: ExtractLimits,
  rules: PathRules,
): Promise<ExtractResult> {
  const info = await stat(zipPath);
  if (info.size > limits.maxArchiveBytes) throw new UploadRejected('archive_too_large', 'The ZIP file is too large.');

  const fh = await open(zipPath, 'r');
  const head = Buffer.alloc(4);
  await fh.read(head, 0, 4, 0);
  await fh.close();
  if (!(head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)) {
    throw new UploadRejected('invalid_archive', 'The file is not a ZIP archive.');
  }

  const zip = await openZip(zipPath);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), limits.timeoutMs);
  const files: ExtractedFile[] = [];
  const seen = new Set<string>();
  const state = { total: 0 };
  let declaredTotal = 0;

  try {
    if (zip.entryCount > limits.maxFiles) throw new UploadRejected('too_many_files', `The archive has more than ${limits.maxFiles} entries.`);
    await mkdir(destDir, { recursive: true });

    for await (const entry of entriesOf(zip)) {
      if (abort.signal.aborted) throw new UploadRejected('timeout', 'Unpacking took too long.');
      const name = entry.fileName;
      if (isIgnorableEntry(name)) continue;

      const checked = checkEntryName(name, rules);
      if (!checked.ok) throw new UploadRejected('unsafe_entry', `Rejected "${printable(name)}": ${checked.reason}.`);
      rejectSpecialEntry(entry);
      if (name.endsWith('/')) continue;

      const key = checked.path.toLowerCase();
      if (seen.has(key)) throw new UploadRejected('duplicate_entry', `Two entries share the name "${printable(name)}".`);
      seen.add(key);

      if (entry.uncompressedSize > limits.maxFileBytes) throw new UploadRejected('file_too_large', `"${printable(name)}" is too large.`);
      declaredTotal += entry.uncompressedSize;
      if (declaredTotal > limits.maxUnpackedBytes) throw new UploadRejected('archive_too_large', 'The unpacked game is too large.');
      if (entry.uncompressedSize > MB && entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > limits.maxRatio) {
        throw new UploadRejected('suspicious_compression', `"${printable(name)}" has a suspicious compression ratio.`);
      }

      const absPath = resolveInside(destDir, checked.path);
      await mkdir(path.dirname(absPath), { recursive: true });
      try {
        const source = await openEntry(zip, entry);
        // flag "wx": never overwrite and never follow an existing link
        await pipeline(source, budget(state, limits), fs.createWriteStream(absPath, { flags: 'wx' }), { signal: abort.signal });
      } catch (err) {
        if (err instanceof UploadRejected) throw err;
        if ((err as Error).name === 'AbortError') throw new UploadRejected('timeout', 'Unpacking took too long.');
        if ((err as NodeJS.ErrnoException).code === 'ENOSPC') throw err;
        throw new UploadRejected('invalid_archive', 'The archive is corrupt or its sizes do not match its contents.');
      }

      const ext = extensionOf(checked.path);
      const written = (await stat(absPath)).size;
      const sample = Buffer.alloc(Math.min(8192, written));
      const reader = await open(absPath, 'r');
      try {
        await reader.read(sample, 0, sample.length, 0);
      } finally {
        await reader.close();
      }
      const verdict = checkSignature(ext, sample);
      if (!verdict.ok) throw new UploadRejected('bad_content', `"${printable(name)}": ${verdict.reason}.`);
      files.push({ path: checked.path, absPath, size: written, ext });
    }
  } finally {
    clearTimeout(timer);
    zip.close();
  }

  if (!files.some((f) => f.path === 'index.html')) {
    const inFolder = files.some((f) => /^[^/]+\/index\.html$/.test(f.path));
    throw new UploadRejected(
      'missing_entry_point',
      inFolder
        ? 'index.html is inside a folder. Zip the contents of the folder, not the folder itself, so index.html is at the top level.'
        : 'The archive must contain index.html at its top level.',
    );
  }
  return { files, totalBytes: state.total };
}
