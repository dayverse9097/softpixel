import argon2 from 'argon2';

// OWASP's minimum Argon2id profile (19 MiB, 2 passes, 1 lane). Raise memoryCost if your server allows.
const OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function needsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, OPTIONS);
}

let decoy: string | undefined;

/** Spend the same time as a real check, so an unknown email is not distinguishable by response time. */
export async function dummyVerify(password: string): Promise<void> {
  decoy ??= await hashPassword('nexplay-decoy-password-never-matches');
  await verifyPassword(decoy, password);
}
