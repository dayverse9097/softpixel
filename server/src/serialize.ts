import type { Config } from './config.js';

interface PublicGameRow {
  slug: string;
  title: string;
  description: string;
  instructions: string;
  category: string;
  controls: unknown;
  coverKey: string | null;
  featured: boolean;
  publishedAt: Date | null;
  currentVersion: { id: string; version: string } | null;
}

export const PUBLIC_GAME_SELECT = {
  slug: true,
  title: true,
  description: true,
  instructions: true,
  category: true,
  controls: true,
  coverKey: true,
  featured: true,
  publishedAt: true,
  currentVersion: { select: { id: true, version: true } },
} as const;

export function coverUrl(config: Config, coverKey: string | null): string | null {
  return coverKey ? `${config.GAMES_ORIGIN}/covers/${coverKey}` : null;
}

export function toPublicGame(g: PublicGameRow, config: Config, detail = false) {
  const base = {
    slug: g.slug,
    title: g.title,
    description: g.description,
    category: g.category,
    featured: g.featured,
    publishedAt: g.publishedAt,
    coverUrl: coverUrl(config, g.coverKey),
  };
  if (!detail) return base;
  return {
    ...base,
    instructions: g.instructions,
    controls: g.controls,
    version: g.currentVersion?.version ?? null,
    playUrl: g.currentVersion ? `${config.GAMES_ORIGIN}/g/${g.currentVersion.id}/index.html` : null,
  };
}

interface AdminGameRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  instructions: string;
  category: string;
  controls: unknown;
  coverKey: string | null;
  featured: boolean;
  status: string;
  currentVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  currentVersion?: { id: string; version: string } | null;
  _count?: { versions: number };
}

export function toAdminGame(g: AdminGameRow) {
  return {
    id: g.id,
    slug: g.slug,
    title: g.title,
    description: g.description,
    instructions: g.instructions,
    category: g.category,
    controls: g.controls,
    featured: g.featured,
    status: g.status,
    hasCover: Boolean(g.coverKey),
    currentVersionId: g.currentVersionId,
    currentVersion: g.currentVersion?.version ?? null,
    versionCount: g._count?.versions,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
    publishedAt: g.publishedAt,
  };
}
