import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import type { Deps } from '../deps.js';
import { HttpError } from '../errors.js';
import { limit } from '../limiters.js';
import { listQuery, slugSchema } from '../schemas.js';
import { PUBLIC_GAME_SELECT, toPublicGame } from '../serialize.js';

/**
 * Public, read-only catalogue. These handlers use the read-only database role, which row-level security
 * restricts to published games, so even a coding mistake here cannot expose a draft.
 * No cookies are set and no session is created.
 */
export function publicRouter(d: Deps): Router {
  const r = Router();

  r.get('/games', async (req, res) => {
    const q = listQuery.parse(req.query);
    const where: Prisma.GameWhereInput = { status: 'PUBLISHED' };
    if (q.category) where.category = { equals: q.category, mode: 'insensitive' };
    if (q.featured) where.featured = q.featured === 'true';
    if (q.q) {
      const terms = q.q.split(/\s+/).filter(Boolean).slice(0, 6);
      where.AND = terms.map((term) => ({
        OR: [
          { title: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          { category: { contains: term, mode: 'insensitive' } },
        ],
      }));
    }
    const orderBy: Prisma.GameOrderByWithRelationInput = q.sort === 'title' ? { title: 'asc' } : { publishedAt: 'desc' };
    const [total, rows] = await Promise.all([
      d.dbPublic.game.count({ where }),
      d.dbPublic.game.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: PUBLIC_GAME_SELECT }),
    ]);
    res.json({ items: rows.map((g) => toPublicGame(g, d.config)), page: q.page, pageSize: q.pageSize, total });
  });

  r.get('/games/:slug', async (req, res) => {
    const slug = slugSchema.safeParse(req.params.slug);
    if (!slug.success) throw new HttpError(404, 'not_found', 'Game not found.');
    const game = await d.dbPublic.game.findFirst({ where: { slug: slug.data, status: 'PUBLISHED' }, select: PUBLIC_GAME_SELECT });
    if (!game || !game.currentVersion) throw new HttpError(404, 'not_found', 'Game not found.');
    res.json({ game: toPublicGame(game, d.config, true) });
  });

  r.get('/categories', async (_req, res) => {
    const groups = await d.dbPublic.game.groupBy({ by: ['category'], where: { status: 'PUBLISHED' }, _count: { _all: true }, orderBy: { category: 'asc' } });
    res.json({ items: groups.map((g) => ({ name: g.category, count: g._count._all })) });
  });

  // Anonymous, cookie-free launch counter: one number per game per day. Nothing about the visitor is stored.
  r.post('/games/:slug/launch', limit(d.limiters.launch, (req) => `${req.ip ?? 'x'}:${String(req.params.slug)}`), async (req, res) => {
    const slug = slugSchema.safeParse(req.params.slug);
    if (!slug.success) throw new HttpError(404, 'not_found', 'Game not found.');
    const game = await d.dbPublic.game.findFirst({ where: { slug: slug.data, status: 'PUBLISHED' }, select: { id: true } });
    if (!game) throw new HttpError(404, 'not_found', 'Game not found.');
    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await d.db.gameLaunchDaily.upsert({
      where: { gameId_day: { gameId: game.id, day } },
      create: { gameId: game.id, day, count: 1 },
      update: { count: { increment: 1 } },
    });
    res.status(204).end();
  });

  return r;
}
