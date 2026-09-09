import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Env } from '@/lib/env';
import type { StorageDriver, StoredObject } from './index';

/**
 * Any S3-compatible bucket. `S3_ENDPOINT` is what makes Cloudflare R2 or MinIO work;
 * leave it empty for AWS. Files are served from `S3_PUBLIC_URL` (a public bucket URL or a
 * CDN in front of it), so the app never proxies uploads through Node.
 */
export function createS3Storage(env: Env): StorageDriver {
  const bucket = env.S3_BUCKET!;
  const client = new S3Client({
    region: env.S3_REGION ?? 'auto',
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: !!env.S3_ENDPOINT,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
  });
  const publicBase = (env.S3_PUBLIC_URL ?? `${env.S3_ENDPOINT ?? `https://s3.${env.S3_REGION}.amazonaws.com`}/${bucket}`).replace(/\/$/, '');

  return {
    name: 's3',

    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        })
      );
      return { key, url: `${publicBase}/${key}`, size: body.byteLength };
    },

    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const bytes = await res.Body?.transformToByteArray();
        return bytes ? Buffer.from(bytes) : null;
      } catch {
        return null;
      }
    },

    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async list(prefix) {
      const objects: StoredObject[] = [];
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix.replace(/\/$/, '') + '/', ContinuationToken: token })
        );
        for (const o of page.Contents ?? []) {
          if (!o.Key) continue;
          objects.push({ key: o.Key, size: o.Size ?? 0, lastModified: o.LastModified ?? new Date(0) });
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return objects;
    },

    urlFor: (key) => `${publicBase}/${key}`,

    keyFor(url) {
      if (!url.startsWith(publicBase + '/')) return null;
      return url.slice(publicBase.length + 1).split(/[?#]/)[0];
    },
  };
}
