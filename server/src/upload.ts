import { randomUUID } from 'node:crypto';
import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { GameVersion } from '@prisma/client';
import { extractGameArchive, limitsFromConfig } from './archive.js';
import type { Deps } from './deps.js';
import { HttpError } from './errors.js';
import { GAME_PATH_RULES, contentTypeFor } from './lib/file-types.js';

const MB = 1024 * 1024;

/**
 * Turn an uploaded ZIP into a stored, validated game version.
 *
 * Order matters for safety: scan, unpack and validate everything first, copy to private storage next,
 * and only then create the database row. A failure at any step removes what was stored, so a rejected
 * upload never leaves a partial or reachable game behind. Publishing is a separate admin action.
 */
export async function ingestBuild(
  d: Deps,
  args: { gameId: string; label: string; zipPath: string },
): Promise<GameVersion> {
  const { config, storage, db, scanner, logger } = d;
  const versionId = randomUUID();
  const prefix = `games/${args.gameId}/${versionId}/`;
  const workDir = path.join(config.UPLOAD_TMP_DIR, `work-${versionId}`);

  try {
    const taken = await db.gameVersion.findUnique({ where: { gameId_version: { gameId: args.gameId, version: args.label } }, select: { id: true } });
    if (taken) throw new HttpError(409, 'version_exists', 'That version label is already used for this game.');

    await scanner.scanFile(args.zipPath);
    const { files, totalBytes } = await extractGameArchive(args.zipPath, workDir, limitsFromConfig(config), GAME_PATH_RULES);

    const used = await db.gameVersion.aggregate({ where: { gameId: args.gameId }, _sum: { totalBytes: true } });
    if ((used._sum.totalBytes ?? 0) + totalBytes > config.MAX_GAME_MB * MB) {
      throw new HttpError(409, 'quota_exceeded', 'This game would exceed its storage limit. Delete an old version first.');
    }

    for (let i = 0; i < files.length; i += 8) {
      await Promise.all(files.slice(i, i + 8).map((f) => storage.putFile(prefix + f.path, f.absPath, contentTypeFor(f.ext))));
    }

    return await db.gameVersion.create({
      data: {
        id: versionId,
        gameId: args.gameId,
        version: args.label,
        storagePrefix: prefix,
        fileCount: files.length,
        totalBytes,
        scanned: scanner.name !== 'none',
      },
    });
  } catch (err) {
    await storage.deletePrefix(prefix).catch((cleanupError) => logger.error({ err: cleanupError }, 'cleanup after failed upload failed'));
    throw err;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Remove leftovers from crashed uploads. Run at startup. */
export async function purgeStaleUploads(dir: string, maxAgeMs = 3_600_000): Promise<void> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  const cutoff = Date.now() - maxAgeMs;
  for (const name of names) {
    const full = path.join(dir, name);
    try {
      if ((await stat(full)).mtimeMs < cutoff) await rm(full, { recursive: true, force: true });
    } catch {
      /* already gone */
    }
  }
}
