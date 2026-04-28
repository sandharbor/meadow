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

import { S3Client } from '@aws-sdk/client-s3';
import type { S3ProviderResources, S3ProviderSecrets } from './s3Config.js';

/**
 * Build an S3 client from the provider's resources and secrets. No
 * temporary-credentials exchange here — the S3 provider is bring-your-own-bucket,
 * so either static credentials (access key id + secret) or the AWS SDK's
 * default chain pick up whatever is configured. Region falls back to
 * us-east-1 for S3-compatible endpoints that don't care.
 */
export function createS3Client(
  resources: S3ProviderResources,
  secrets: S3ProviderSecrets,
): S3Client {
  const hasStaticCreds =
    typeof secrets.s3AccessKeyId === 'string' &&
    secrets.s3AccessKeyId.length > 0 &&
    typeof secrets.s3SecretAccessKey === 'string' &&
    secrets.s3SecretAccessKey.length > 0;

  return new S3Client({
    region: resources.s3Region || 'us-east-1',
    maxAttempts: 3,
    ...(hasStaticCreds
      ? {
          credentials: {
            accessKeyId: secrets.s3AccessKeyId!,
            secretAccessKey: secrets.s3SecretAccessKey!,
          },
        }
      : {}),
    ...(resources.s3Endpoint ? { endpoint: resources.s3Endpoint } : {}),
    ...(resources.s3ForcePathStyle ? { forcePathStyle: resources.s3ForcePathStyle } : {}),
  });
}

export function requireBucket(resources: S3ProviderResources): string {
  if (!resources.s3BucketName) {
    throw new Error(
      'S3 bucket name is not configured. Open the Publish to S3 tab and set it under S3 configuration.',
    );
  }
  return resources.s3BucketName;
}

/**
 * Map AWS SDK errors to a user-facing message. Auth-related failures get a
 * friendlier hint pointing to the configuration section; everything else
 * passes through with its underlying message preserved.
 */
export function describeS3Error(err: unknown): string {
  const e = err as { name?: string; Code?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  const code = e?.name || e?.Code || '';
  const status = e?.$metadata?.httpStatusCode;
  const baseMessage = e?.message ? String(e.message) : String(err);

  if (code === 'InvalidAccessKeyId') {
    return 'The access key id was not recognized by S3. Check the access key id under S3 configuration.';
  }
  if (code === 'SignatureDoesNotMatch') {
    return 'The secret access key does not match the access key id. Check the secret access key under S3 configuration.';
  }
  if (code === 'AccessDenied' || status === 403) {
    return 'The provided credentials do not have permission to write to this bucket. Check the access key, secret, and the bucket policy under S3 configuration.';
  }
  if (code === 'NoSuchBucket') {
    return 'The configured S3 bucket does not exist. Check the bucket name under S3 configuration.';
  }
  if (code === 'CredentialsProviderError' || /credentials/i.test(baseMessage)) {
    return 'No S3 credentials are configured. Set an access key id and secret access key under S3 configuration.';
  }
  return baseMessage;
}
