import { z } from 'zod';
import { isValidSlug } from './lib/slug.js';

// Plain text only. Control characters (other than tab and line breaks) are refused.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const plain = (max: number, min = 0) =>
  z.string().trim().min(min).max(max).refine((s) => !CONTROL.test(s), 'control characters are not allowed');

export const uuid = z.string().uuid();
export const slugSchema = z.string().trim().toLowerCase().refine(isValidSlug, 'use lowercase letters, numbers and single hyphens');

const control = z.object({ input: plain(40, 1), action: plain(80, 1) }).strict();

export const gameInput = z
  .object({
    title: plain(80, 1),
    slug: slugSchema.optional(),
    description: plain(2000, 1),
    instructions: plain(2000).default(''),
    category: plain(40, 1).refine((s) => /^[\p{L}\p{N}][\p{L}\p{N} &'-]*$/u.test(s), 'use letters, numbers, spaces, & and - only'),
    controls: z.array(control).max(12).default([]),
    featured: z.boolean().default(false),
  })
  .strict();

export const gameUpdate = gameInput.partial().strict();

export const versionLabel = z.string().trim().regex(/^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/, 'use up to 32 letters, numbers, dots, hyphens');

const page = z.coerce.number().int().min(1).max(10_000).default(1);

export const listQuery = z
  .object({
    q: plain(80).optional(),
    category: plain(40).optional(),
    sort: z.enum(['new', 'title']).default('new'),
    page,
    pageSize: z.coerce.number().int().min(1).max(48).default(12),
    featured: z.enum(['true', 'false']).optional(),
  })
  .strict();

export const adminListQuery = z
  .object({
    q: plain(80).optional(),
    category: plain(40).optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
    page,
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const pageQuery = z.object({ page, pageSize: z.coerce.number().int().min(1).max(100).default(50) }).strict();

export const loginBody = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(256),
    totp: z.string().regex(/^\d{6}$/).optional(),
    recoveryCode: z.string().min(8).max(32).optional(),
  })
  .strict();

export const passwordChangeBody = z
  .object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().max(256), totp: z.string().regex(/^\d{6}$/).optional() })
  .strict();

export const mfaSetupBody = z.object({ password: z.string().min(1).max(256) }).strict();
export const mfaEnableBody = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
export const mfaDisableBody = z
  .object({ password: z.string().min(1).max(256), code: z.string().regex(/^\d{6}$/).optional(), recoveryCode: z.string().min(8).max(32).optional() })
  .strict();

export const publishBody = z.object({ versionId: uuid }).strict();
export const deleteGameBody = z.object({ confirmSlug: z.string().min(1).max(60) }).strict();
