import readline from 'node:readline';
import { Writable } from 'node:stream';
import { PrismaClient } from '@prisma/client';

/** Admin scripts connect with the migration role, so the running server never needs permission to create accounts. */
export function migratorDb(): PrismaClient {
  const url = process.env.MIGRATOR_DATABASE_URL;
  if (!url) {
    console.error('Set MIGRATOR_DATABASE_URL (the owner role) in your environment or .env file.');
    process.exit(1);
  }
  return new PrismaClient({ datasourceUrl: url });
}

export function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => (rl.close(), resolve(answer.trim()))));
}

/** Reads a password without echoing it, so it never appears on screen, in scrollback or in shell history. */
export function askHidden(question: string): Promise<string> {
  let muted = false;
  const out = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}
