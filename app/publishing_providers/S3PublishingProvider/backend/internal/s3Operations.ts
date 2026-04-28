/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import mime from 'mime-types';

/**
 * Minimal upload + delete helpers for the S3PublishingProvider. Deliberately
 * simple: no diffing, no image compression, no file-size limits, no
 * parallelism tuning.
 */

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function getContentType(filePath: string): string {
  return mime.lookup(filePath) || 'application/octet-stream';
}

export interface UploadResult {
  filesUploaded: number;
  totalBytes: number;
}

/**
 * Upload every file under `localDir` to `s3://bucket/s3Prefix/...`. Existing
 * objects at the destination are overwritten; objects that used to be there
 * but aren't now are deleted so the destination matches the source.
 */
export async function uploadDirectory(
  client: S3Client,
  bucket: string,
  s3Prefix: string,
  localDir: string,
): Promise<UploadResult> {
  const normalizedPrefix = s3Prefix.replace(/^\/+|\/+$/g, '');
  const prefixWithSlash = normalizedPrefix.length > 0 ? `${normalizedPrefix}/` : '';

  const localFiles = walk(localDir);
  const newKeys = new Set<string>();

  let totalBytes = 0;
  for (const filePath of localFiles) {
    const relativePath = relative(localDir, filePath).replace(/\\/g, '/');
    const key = `${prefixWithSlash}${relativePath}`;
    const body = readFileSync(filePath);
    totalBytes += body.length;
    newKeys.add(key);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: getContentType(filePath),
      }),
    );
  }

  // Prune any existing objects under the prefix that are no longer present
  // locally. Keeps the published site in-sync with the preview.
  const existing = await listPrefix(client, bucket, prefixWithSlash);
  const toDelete = existing.filter((key) => !newKeys.has(key));
  if (toDelete.length > 0) {
    await deleteKeys(client, bucket, toDelete);
  }

  return { filesUploaded: localFiles.length, totalBytes };
}

export async function deletePrefix(
  client: S3Client,
  bucket: string,
  s3Prefix: string,
): Promise<{ filesDeleted: number }> {
  const normalizedPrefix = s3Prefix.replace(/^\/+|\/+$/g, '');
  const prefixWithSlash = normalizedPrefix.length > 0 ? `${normalizedPrefix}/` : '';
  const keys = await listPrefix(client, bucket, prefixWithSlash);
  if (keys.length === 0) return { filesDeleted: 0 };
  await deleteKeys(client, bucket, keys);
  return { filesDeleted: keys.length };
}

async function listPrefix(client: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of response.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

async function deleteKeys(client: S3Client, bucket: string, keys: string[]): Promise<void> {
  const BATCH_SIZE = 1000;
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}

export async function countPrefix(
  client: S3Client,
  bucket: string,
  s3Prefix: string,
): Promise<{ htmlCount: number; otherCount: number }> {
  const normalizedPrefix = s3Prefix.replace(/^\/+|\/+$/g, '');
  const prefixWithSlash = normalizedPrefix.length > 0 ? `${normalizedPrefix}/` : '';
  const keys = await listPrefix(client, bucket, prefixWithSlash);
  let htmlCount = 0;
  let otherCount = 0;
  for (const key of keys) {
    if (key.toLowerCase().endsWith('.html')) htmlCount++;
    else otherCount++;
  }
  return { htmlCount, otherCount };
}
