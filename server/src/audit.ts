import type { Prisma, PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import { redact } from './lib/redact.js';

export interface AuditInput {
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
}

/**
 * Record a sensitive action. No IP address or user agent is stored, and credential-like keys are redacted.
 * A failure to write is logged but never blocks the action the admin asked for.
 */
export async function audit(db: PrismaClient, logger: Logger, event: AuditInput): Promise<void> {
  try {
    await db.auditEvent.create({
      data: {
        actorId: event.actorId ?? null,
        action: event.action,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        meta: redact(event.meta ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.error({ err, action: event.action }, 'audit write failed');
  }
}
