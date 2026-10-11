import { PrismaClient } from '@prisma/client';

export function createDb(url: string): PrismaClient {
  return new PrismaClient({ datasourceUrl: url, log: ['warn', 'error'] });
}
