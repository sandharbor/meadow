/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { partitionResourceName, type LocalServiceContainer, type LocalServicePart } from "./parts.js";

export const MINIO_ACCESS_KEY_ID = "FAKE-E2E-MINIO-ACCESS-KEY";
export const MINIO_SECRET_ACCESS_KEY = "FAKE-E2E-MINIO-SECRET-KEY";
const MODULE_DIR = path.resolve(import.meta.dirname, "..");

export function minioBucketName(partition: string): string {
  return partitionResourceName(`meadow-${partition}`);
}

export function createMinioClient(endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: "us-west-2",
    forcePathStyle: true,
    credentials: { accessKeyId: MINIO_ACCESS_KEY_ID, secretAccessKey: MINIO_SECRET_ACCESS_KEY },
  });
}

async function listKeys(client: S3Client, bucket: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const result = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }));
    for (const object of result.Contents ?? []) if (object.Key) keys.push(object.Key);
    continuationToken = result.NextContinuationToken;
  } while (continuationToken);
  return keys.sort();
}

async function emptyBucket(client: S3Client, bucket: string): Promise<void> {
  const keys = await listKeys(client, bucket);
  for (let index = 0; index < keys.length; index += 1000) {
    await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keys.slice(index, index + 1000).map(Key => ({ Key })) },
    }));
  }
}

async function ensureBucket(client: S3Client, bucket: string): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      // A parallel worker may have created it between the probe and create.
      const name = (error as { name?: string }).name;
      if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") throw error;
    }
  }
}

function walkFiles(root: string, relative = ""): string[] {
  const directory = path.join(root, relative);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walkFiles(root, child) : entry.isFile() ? [child] : [];
  });
}

export const minioPart: LocalServicePart = {
  id: "minio",
  displayName: "Object storage (MinIO)",
  async startContainer(): Promise<LocalServiceContainer> {
    // Zero pre-created buckets: partitions create their own.
    const output = execFileSync(process.execPath, ["--import", "tsx", path.join(MODULE_DIR, "scripts/start_minio.ts"), "0"], {
      cwd: MODULE_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const parsed = JSON.parse(output.trim()) as { endpoint: string; containerName: string };
    return { endpoint: parsed.endpoint, containerName: parsed.containerName };
  },
  async isHealthy(container) {
    try {
      const response = await fetch(`${container.endpoint}/minio/health/live`, { signal: AbortSignal.timeout(2_000) });
      return response.ok;
    } catch {
      return false;
    }
  },
  async preparePartition(container, partition) {
    const client = createMinioClient(container.endpoint);
    try {
      const bucket = minioBucketName(partition);
      await ensureBucket(client, bucket);
      await emptyBucket(client, bucket);
    } finally {
      client.destroy();
    }
  },
  async dropPartition(container, partition) {
    const client = createMinioClient(container.endpoint);
    try {
      const bucket = minioBucketName(partition);
      await emptyBucket(client, bucket);
      await client.send(new DeleteBucketCommand({ Bucket: bucket }));
    } catch {
      // A partition that was never prepared has nothing to drop.
    } finally {
      client.destroy();
    }
  },
  async capture(container, partition, directory) {
    const client = createMinioClient(container.endpoint);
    try {
      const bucket = minioBucketName(partition);
      const keys = await listKeys(client, bucket);
      for (const key of keys) {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const bytes = Buffer.from(await result.Body!.transformToByteArray());
        const target = path.join(directory, "objects", key);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes);
        if (result.ContentType) {
          const metaTarget = path.join(directory, "content-types", `${key}.txt`);
          fs.mkdirSync(path.dirname(metaTarget), { recursive: true });
          fs.writeFileSync(metaTarget, result.ContentType);
        }
      }
      return keys.length > 0;
    } finally {
      client.destroy();
    }
  },
  async restore(container, partition, directory) {
    await this.preparePartition(container, partition);
    const objectsDirectory = path.join(directory, "objects");
    if (!fs.existsSync(objectsDirectory)) return;
    const client = createMinioClient(container.endpoint);
    try {
      const bucket = minioBucketName(partition);
      for (const key of walkFiles(objectsDirectory)) {
        const contentTypePath = path.join(directory, "content-types", `${key}.txt`);
        await client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: fs.readFileSync(path.join(objectsDirectory, key)),
          ...(fs.existsSync(contentTypePath) && { ContentType: fs.readFileSync(contentTypePath, "utf8") }),
        }));
      }
    } finally {
      client.destroy();
    }
  },
};
