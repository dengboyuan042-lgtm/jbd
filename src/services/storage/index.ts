import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import { env } from '@/lib/env';

export type PutOptions = {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
};

export type StoredObject = {
  key: string;
  size: number;
  checksum: string;
  contentType: string;
};

export interface StorageProvider {
  readonly id: string;
  put(options: PutOptions): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  /** Byte range read — used by the audio/video player and PDF viewer. */
  stream(key: string, range?: { start: number; end: number }): Promise<{
    body: ReadableStream<Uint8Array>;
    size: number;
  }>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Public or signed URL; local driver serves through an authorised route. */
  url(key: string): Promise<string>;
}

/* ─────────────────────────── local filesystem ─────────────────────────── */

class LocalStorage implements StorageProvider {
  readonly id = 'local';

  constructor(private readonly root: string) {}

  private resolve(key: string) {
    const safe = key.replace(/\.\./g, '').replace(/^\/+/, '');
    return path.join(this.root, safe);
  }

  async put({ key, body, contentType }: PutOptions): Promise<StoredObject> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    const buffer = Buffer.from(body);
    await writeFile(target, buffer);
    return {
      key,
      size: buffer.byteLength,
      checksum: createHash('sha256').update(buffer).digest('hex'),
      contentType,
    };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async stream(key: string, range?: { start: number; end: number }) {
    const target = this.resolve(key);
    const info = await stat(target);
    const node = createReadStream(target, range);
    return {
      body: Readable.toWeb(node) as ReadableStream<Uint8Array>,
      size: info.size,
    };
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async url(key: string): Promise<string> {
    return `/api/storage/${encodeURIComponent(key)}`;
  }
}

/* ─────────────────────────── S3-compatible ────────────────────────────── */

/**
 * Minimal SigV4 S3 client — works with AWS S3, Cloudflare R2, MinIO, Backblaze.
 * Kept dependency-free so the local driver stays the only default.
 */
class S3Storage implements StorageProvider {
  readonly id = 's3';

  constructor(
    private readonly config: {
      endpoint: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
    },
  ) {}

  private objectUrl(key: string) {
    return `${this.config.endpoint.replace(/\/$/, '')}/${this.config.bucket}/${encodeURI(key)}`;
  }

  private async signedFetch(
    method: string,
    key: string,
    body?: Buffer,
    headers: Record<string, string> = {},
  ) {
    const { createHmac } = await import('node:crypto');
    const url = new URL(this.objectUrl(key));
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash('sha256')
      .update(body ?? Buffer.alloc(0))
      .digest('hex');

    const signedHeaders: Record<string, string> = {
      host: url.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...Object.fromEntries(
        Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
      ),
    };
    const sortedKeys = Object.keys(signedHeaders).sort();
    const canonicalHeaders = sortedKeys
      .map((k) => `${k}:${signedHeaders[k]}\n`)
      .join('');
    const signedHeaderList = sortedKeys.join(';');
    const canonicalRequest = [
      method,
      url.pathname,
      '',
      canonicalHeaders,
      signedHeaderList,
      payloadHash,
    ].join('\n');

    const scope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const hmac = (k: Buffer | string, d: string) =>
      createHmac('sha256', k).update(d).digest();
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${this.config.secretAccessKey}`, dateStamp), this.config.region), 's3'),
      'aws4_request',
    );
    const signature = createHmac('sha256', signingKey)
      .update(stringToSign)
      .digest('hex');

    return fetch(url, {
      method,
      headers: {
        ...signedHeaders,
        authorization: `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, SignedHeaders=${signedHeaderList}, Signature=${signature}`,
      },
      body: body ? new Uint8Array(body) : undefined,
    });
  }

  async put({ key, body, contentType }: PutOptions): Promise<StoredObject> {
    const buffer = Buffer.from(body);
    const res = await this.signedFetch('PUT', key, buffer, {
      'content-type': contentType,
    });
    if (!res.ok) throw new Error(`S3 put failed: ${res.status} ${await res.text()}`);
    return {
      key,
      size: buffer.byteLength,
      checksum: createHash('sha256').update(buffer).digest('hex'),
      contentType,
    };
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.signedFetch('GET', key);
    if (!res.ok) throw new Error(`S3 get failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async stream(key: string, range?: { start: number; end: number }) {
    const res = await this.signedFetch(
      'GET',
      key,
      undefined,
      range ? { range: `bytes=${range.start}-${range.end}` } : {},
    );
    if (!res.ok || !res.body) throw new Error(`S3 stream failed: ${res.status}`);
    return {
      body: res.body,
      size: Number(res.headers.get('content-length') ?? 0),
    };
  }

  async delete(key: string): Promise<void> {
    await this.signedFetch('DELETE', key);
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.signedFetch('HEAD', key);
    return res.ok;
  }

  async url(key: string): Promise<string> {
    // Served through the app so authorisation is always enforced.
    return `/api/storage/${encodeURIComponent(key)}`;
  }
}

let instance: StorageProvider | null = null;

export function storage(): StorageProvider {
  if (instance) return instance;
  const e = env();
  if (
    e.STORAGE_DRIVER === 's3' &&
    e.S3_ENDPOINT &&
    e.S3_BUCKET &&
    e.S3_ACCESS_KEY_ID &&
    e.S3_SECRET_ACCESS_KEY
  ) {
    instance = new S3Storage({
      endpoint: e.S3_ENDPOINT,
      region: e.S3_REGION,
      bucket: e.S3_BUCKET,
      accessKeyId: e.S3_ACCESS_KEY_ID,
      secretAccessKey: e.S3_SECRET_ACCESS_KEY,
    });
  } else {
    instance = new LocalStorage(path.resolve(process.cwd(), e.STORAGE_LOCAL_DIR));
  }
  return instance;
}

/** Storage keys are namespaced by user so a leaked key cannot cross tenants. */
export function storageKey(
  userId: string,
  scope: 'files' | 'recordings' | 'exports',
  id: string,
  filename: string,
) {
  const safe = filename.replace(/[^\w.\-]+/g, '_').slice(-120);
  return `${userId}/${scope}/${id}/${safe}`;
}
