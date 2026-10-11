import fs from 'node:fs';
import net from 'node:net';
import { once } from 'node:events';
import type { Config } from './config.js';
import { UploadRejected } from './errors.js';

export interface Scanner {
  readonly name: string;
  /** Resolve if clean. Throw UploadRejected if malware is found. Any other error means "could not scan" and the upload must fail. */
  scanFile(filePath: string): Promise<void>;
}

export class NoopScanner implements Scanner {
  readonly name = 'none';
  async scanFile(): Promise<void> {}
}

/** Minimal clamd client using the INSTREAM command. clamd's StreamMaxLength must be at least MAX_ARCHIVE_MB. */
export class ClamAvScanner implements Scanner {
  readonly name = 'clamav';
  private host: string;
  private port: number;
  private timeoutMs: number;

  constructor(host: string, port: number, timeoutMs = 60_000) {
    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
  }

  async scanFile(filePath: string): Promise<void> {
    const socket = net.createConnection({ host: this.host, port: this.port });
    socket.setTimeout(this.timeoutMs);
    const reply = new Promise<string>((resolve, reject) => {
      let data = '';
      socket.on('data', (d) => (data += d.toString('utf8')));
      socket.on('end', () => resolve(data));
      socket.on('error', reject);
      socket.on('timeout', () => reject(new Error('clamav timeout')));
    });
    reply.catch(() => {}); // the real error is surfaced below; this stops an early failure becoming unhandled
    try {
      socket.write('zINSTREAM\0');
      for await (const chunk of fs.createReadStream(filePath, { highWaterMark: 64 * 1024 })) {
        const buf = chunk as Buffer;
        const length = Buffer.alloc(4);
        length.writeUInt32BE(buf.length);
        socket.write(length);
        if (!socket.write(buf)) await once(socket, 'drain');
      }
      socket.write(Buffer.alloc(4)); // zero-length chunk ends the stream
      const text = (await reply).replace(/\0/g, '').trim();
      if (text.endsWith('OK')) return;
      if (text.endsWith('FOUND')) throw new UploadRejected('malware_detected', 'The upload was flagged by the malware scanner.');
      throw new Error(`clamav error: ${text}`);
    } finally {
      socket.destroy();
    }
  }
}

export function createScanner(config: Config): Scanner {
  return config.CLAMAV_HOST ? new ClamAvScanner(config.CLAMAV_HOST, config.CLAMAV_PORT) : new NoopScanner();
}
