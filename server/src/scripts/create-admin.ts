import { z } from 'zod';
import { passwordProblems } from '../lib/password-policy.js';
import { hashPassword } from '../password.js';
import { arg, ask, askHidden, flag, migratorDb } from './shared.js';

// Creates an administrator. There is no default account and no registration endpoint.
const db = migratorDb();
try {
  const existing = await db.user.count();
  if (existing > 0 && !flag('additional')) {
    console.error('An administrator already exists. Add --additional to create another one.');
    process.exit(1);
  }
  const email = z.string().trim().toLowerCase().email().max(254).parse(arg('email') ?? (await ask('Admin email: ')));
  const password = await askHidden('Password (12+ characters): ');
  const problems = passwordProblems(password, email);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  if (password !== (await askHidden('Repeat password: '))) {
    console.error('The passwords do not match.');
    process.exit(1);
  }
  const user = await db.user.create({ data: { email, passwordHash: await hashPassword(password), role: 'ADMIN' } });
  await db.auditEvent.create({ data: { actorId: user.id, action: 'admin.created', targetType: 'user', targetId: user.id } });
  console.log(`Administrator created: ${email}\nSign in, then turn on two-factor authentication.`);
} finally {
  await db.$disconnect();
}
