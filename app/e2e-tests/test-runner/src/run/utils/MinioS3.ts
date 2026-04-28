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
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import type { Expect } from "@playwright/test";

/**
 * Utility for interacting with MinIO/S3 in e2e tests.
 *
 * Wraps the AWS S3 SDK with convenience methods for listing, asserting,
 * downloading, and deleting objects.  Follows the same pattern as
 * MeadowHomeGit — constructor takes connection info + Playwright expect.
 */
export class MinioS3 {
  private client: S3Client;

  constructor(
    private endpoint: string,
    private bucket: string,
    private expect: Expect,
  ) {
    this.client = new S3Client({
      endpoint,
      region: "us-west-2",
      forcePathStyle: true,
      credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" },
    });
  }

  /** List all object keys in the bucket, optionally filtered by prefix. */
  async listKeys(prefix?: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      if (result.Contents) {
        for (const obj of result.Contents) {
          if (obj.Key) keys.push(obj.Key);
        }
      }
      continuationToken = result.NextContinuationToken;
    } while (continuationToken);
    return keys;
  }

  /** Assert that no objects exist under the given prefix (or entire bucket). */
  async expectEmpty(prefix?: string) {
    const keys = await this.listKeys(prefix);
    this.expect(
      keys.length,
      `Expected no S3 objects${prefix ? ` under "${prefix}"` : ""} but found ${keys.length}`,
    ).toBe(0);
  }

  /** Assert that objects exist under the given prefix (or entire bucket). */
  async expectHasFiles(prefix?: string) {
    const keys = await this.listKeys(prefix);
    this.expect(
      keys.length,
      `Expected S3 objects${prefix ? ` under "${prefix}"` : ""} but found none`,
    ).toBeGreaterThan(0);
  }

  /** Assert that at least one .html file exists under the given prefix. */
  async expectHasHtmlFiles(prefix?: string) {
    const keys = await this.listKeys(prefix);
    const htmlFiles = keys.filter((k) => k.endsWith(".html"));
    this.expect(
      htmlFiles.length,
      `Expected HTML files in S3${prefix ? ` under "${prefix}"` : ""} but found none`,
    ).toBeGreaterThan(0);
  }

  /** Download an object's contents as a UTF-8 string. */
  async getObjectContent(key: string): Promise<string> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!result.Body) return "";
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  /** Delete all objects in the bucket. */
  async deleteAll() {
    const keys = await this.listKeys();
    if (keys.length > 0) {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: keys.map((k) => ({ Key: k })) },
        }),
      );
    }
  }

  destroy() {
    this.client.destroy();
  }
}
