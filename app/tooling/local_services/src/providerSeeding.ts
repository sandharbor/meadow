/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { MINIO_ACCESS_KEY_ID, MINIO_SECRET_ACCESS_KEY } from "./minio.js";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../../..");

function readYaml(file: string): Record<string, unknown> {
  return fs.existsSync(file) ? (YAML.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown> | null) ?? {} : {};
}

export function mergeYaml(file: string, patch: Record<string, unknown>, mode?: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, YAML.stringify({ ...readYaml(file), ...patch }), { encoding: "utf8", ...(mode !== undefined && { mode }) });
}

export function providerDirectory(homeDirectory: string, providerId: string): string {
  return path.join(homeDirectory, "app", "publishing_providers", providerId);
}

/** Every publishing provider mounted in this source tree. */
export function mountedPublishingProviders(): string[] {
  const root = path.join(PROJECT_ROOT, "app", "publishing_providers");
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== "_module" && !entry.name.startsWith("."))
    .map(entry => entry.name)
    .sort();
}

/** Make one provider the only active one in a home. */
export function activateOnlyProvider(homeDirectory: string, providerId: string): void {
  for (const provider of mountedPublishingProviders()) {
    mergeYaml(path.join(providerDirectory(homeDirectory, provider), "pp_config.yaml"), { isActive: provider === providerId });
  }
}

export interface S3ProviderEndpoints {
  minioEndpoint: string;
  minioBucket: string;
  webBaseUrl: string;
}

/**
 * Point the open-core S3 provider at a Local Services partition. Activating
 * selects it; otherwise only an already-configured provider is rewired.
 */
export function seedS3Provider(homeDirectory: string, endpoints: S3ProviderEndpoints, options: { activate: boolean }): void {
  const directory = providerDirectory(homeDirectory, "S3PublishingProvider");
  const resourcesPath = path.join(directory, "pp_resources.local.yaml");
  if (!options.activate && !fs.existsSync(resourcesPath)) return;
  if (options.activate) activateOnlyProvider(homeDirectory, "S3PublishingProvider");
  mergeYaml(resourcesPath, {
    s3Endpoint: endpoints.minioEndpoint,
    s3ForcePathStyle: true,
    s3BucketName: endpoints.minioBucket,
    s3Region: "us-east-1",
    webBaseUrl: endpoints.webBaseUrl,
  });
  mergeYaml(path.join(directory, "pp_secrets.yaml"), {
    s3AccessKeyId: MINIO_ACCESS_KEY_ID,
    s3SecretAccessKey: MINIO_SECRET_ACCESS_KEY,
  }, 0o600);
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Checkpoints may only capture homes wired to Local Services, so artifacts
 * never hold hosted credentials. Returns the offending settings, if any.
 */
export function hostedServiceReferences(homeDirectory: string): string[] {
  const root = path.join(homeDirectory, "app", "publishing_providers");
  if (!fs.existsSync(root)) return [];
  const findings: string[] = [];
  for (const provider of fs.readdirSync(root)) {
    const resourcesPath = path.join(root, provider, "pp_resources.local.yaml");
    for (const [key, value] of Object.entries(readYaml(resourcesPath))) {
      if (typeof value !== "string" || !/^https?:\/\//.test(value)) continue;
      if (!LOCAL_HOSTS.has(new URL(value).hostname)) findings.push(`${provider}.${key} = ${value}`);
    }
  }
  return findings;
}
