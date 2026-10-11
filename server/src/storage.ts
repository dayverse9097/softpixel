import fs from 'node:fs';
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Config } from './config.js';
import { resolveInside } from './lib/archive-paths.js';

export interface StoredObject {
  stream: Readable;
  size?: number;
}

export interface Storage {
  putFile(key: string, filePath: string, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  deleteKey(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

const KEY_PATTERN = /^[A-Za-z0-9._\-/ ()+,=@~]+$/;

/** Keys are built from server-generated ids plus validated paths. This is a last line of defence. */
function assertKey(key: string): void {
  if (!KEY_PATTERN.test(key) || key.split('/').some((part) => part === '..' || part === '.' || part === '')) {
    throw new Error('invalid storage key');
  }
}

export class LocalStorage implements Storage {
  private root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async putFile(key: string, filePath: string): Promise<void> {
    assertKey(key);
    const dest = resolveInside(this.root, key);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(filePath, dest);
  }

  async get(key: string): Promise<StoredObject | null> {
    assertKey(key);
    const file = resolveInside(this.root, key);
    try {
      const info = await stat(file);
      if (!info.isFile()) return null;
      return { stream: fs.createReadStream(file), size: info.size };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async deleteKey(key: string): Promise<void> {
    assertKey(key);
    await rm(resolveInside(this.root, key), { force: true });
  }

  async deletePrefix(prefix: string): Promise<void> {
    assertKey(prefix.replace(/\/$/, ''));
    await rm(resolveInside(this.root, prefix), { recursive: true, force: true });
  }

  async list(prefix: string): Promise<string[]> {
    const base = resolveInside(this.root, prefix);
    const out: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries: fs.Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else out.push(path.relative(this.root, full).split(path.sep).join('/'));
      }
    };
    await walk(base);
    return out.sort();
  }
}

export class S3Storage implements Storage {
  private client: S3Client;
  private bucket: string;

  constructor(opts: { bucket: string; region: string; endpoint?: string; accessKeyId: string; secretAccessKey: string }) {
    this.bucket = opts.bucket;
    this.client = new S3Client({
      region: opts.region,
      endpoint: opts.endpoint,
      forcePathStyle: Boolean(opts.endpoint),
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
    });
  }

  async putFile(key: string, filePath: string, contentType: string): Promise<void> {
    assertKey(key);
    const { size } = await stat(filePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fs.createReadStream(filePath),
        ContentLength: size,
        ContentType: contentType,
        CacheControl: 'private, max-age=0',
      }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    assertKey(key);
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.Body) return null;
      return { stream: res.Body as Readable, size: res.ContentLength };
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === 'NoSuchKey' || name === 'NotFound') return null;
      throw err;
    }
  }

  async deleteKey(key: string): Promise<void> {
    assertKey(key);
    await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: [{ Key: key }] } }));
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const item of res.Contents ?? []) if (item.Key) keys.push(item.Key);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }

  async deletePrefix(prefix: string): Promise<void> {
    assertKey(prefix.replace(/\/$/, ''));
    const keys = await this.list(prefix);
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000).map((Key) => ({ Key }));
      await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: batch, Quiet: true } }));
    }
  }
}

export function createStorage(config: Config): Storage {
  if (config.STORAGE_DRIVER === 'local') return new LocalStorage(config.STORAGE_LOCAL_DIR);
  return new S3Storage({
    bucket: config.S3_BUCKET as string,
    region: config.S3_REGION as string,
    endpoint: config.S3_ENDPOINT,
    accessKeyId: config.S3_ACCESS_KEY_ID as string,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY as string,
  });
}
