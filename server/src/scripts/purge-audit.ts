import { migratorDb } from './shared.js';

// Deletes audit events older than AUDIT_RETENTION_DAYS. Schedule it daily (cron, a platform scheduler, etc.).
const days = Number(process.env.AUDIT_RETENTION_DAYS ?? 180);
const db = migratorDb();
try {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const result = await db.auditEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
  console.log(`Deleted ${result.count} audit events older than ${days} days.`);
} finally {
  await db.$disconnect();
}
