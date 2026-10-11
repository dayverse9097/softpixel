import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAdmin, hasDb, resetDb } from './helpers.js';

// Needs the test database prepared with prisma/sql/create-roles.sql and "prisma migrate deploy", plus three connection URLs:
//   TEST_DATABASE_URL (owner), TEST_DATABASE_URL_APP (nexplay_app), TEST_DATABASE_URL_PUBLIC (nexplay_public)
const ready = hasDb && Boolean(process.env.TEST_DATABASE_URL_APP) && Boolean(process.env.TEST_DATABASE_URL_PUBLIC);

describe.skipIf(!ready)('database roles and row-level security', () => {
  const owner = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const app = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL_APP });
  const pub = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL_PUBLIC });

  beforeAll(async () => {
    await resetDb(owner);
    const admin = await createAdmin(owner);
    const live = await owner.game.create({ data: { slug: 'live-game', title: 'Live', description: 'd', category: 'Arcade', createdById: admin.id } });
    const liveVersion = await owner.gameVersion.create({ data: { gameId: live.id, version: '1', storagePrefix: `games/${live.id}/${live.id}/`, fileCount: 1, totalBytes: 1 } });
    await owner.game.update({ where: { id: live.id }, data: { status: 'PUBLISHED', currentVersionId: liveVersion.id } });
    const draft = await owner.game.create({ data: { slug: 'draft-game', title: 'Draft', description: 'd', category: 'Arcade', createdById: admin.id } });
    await owner.gameVersion.create({ data: { gameId: draft.id, version: '1', storagePrefix: `games/${draft.id}/${draft.id}/`, fileCount: 1, totalBytes: 1 } });
  });
  afterAll(async () => {
    await Promise.all([owner.$disconnect(), app.$disconnect(), pub.$disconnect()]);
  });

  it('the public role sees only published games and their live version', async () => {
    expect((await pub.game.findMany()).map((g) => g.slug)).toEqual(['live-game']);
    expect(await pub.gameVersion.count()).toBe(1);
  });

  it('the public role cannot write or read accounts', async () => {
    await expect(pub.game.create({ data: { slug: 'x-game', title: 'x', description: 'x', category: 'x', createdById: (await owner.user.findFirstOrThrow()).id } })).rejects.toThrow();
    await expect(pub.game.updateMany({ data: { title: 'hacked' } })).rejects.toThrow();
    await expect(pub.game.deleteMany({})).rejects.toThrow();
    await expect(pub.user.findMany()).rejects.toThrow();
    await expect(pub.auditEvent.findMany()).rejects.toThrow();
  });

  it('the app role sees drafts too, but cannot create accounts or rewrite the audit trail', async () => {
    expect((await app.game.findMany()).length).toBe(2);
    await expect(app.user.create({ data: { email: 'intruder@example.com', passwordHash: 'x', role: 'ADMIN' } })).rejects.toThrow();
    await expect(app.user.deleteMany({})).rejects.toThrow();
    await expect(app.auditEvent.deleteMany({})).rejects.toThrow();
    await expect(app.auditEvent.updateMany({ data: { action: 'edited' } })).rejects.toThrow();
  });

  it('database constraints reject bad data even from the owner role', async () => {
    const admin = await owner.user.findFirstOrThrow();
    await expect(owner.game.create({ data: { slug: 'Bad Slug', title: 'x', description: 'x', category: 'x', createdById: admin.id } })).rejects.toThrow();
    await expect(owner.game.create({ data: { slug: 'no-version', title: 'x', description: 'x', category: 'x', status: 'PUBLISHED', createdById: admin.id } })).rejects.toThrow();
  });
});
