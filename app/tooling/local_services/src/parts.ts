/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

/**
 * Local Services are stand-ins for hosted backends. Each part owns one shared
 * container and divides it into partitions (a bucket, a table prefix) so E2E
 * workers and Dev Tools forks can use the same container without seeing each
 * other's state. Extensions contribute further parts through the same shape.
 */

export interface LocalServiceContainer {
  containerName: string;
  endpoint: string;
}

export interface LocalServicePart {
  /** Stable identifier used in state files and checkpoint trees. */
  readonly id: string;
  readonly displayName: string;
  startContainer(): Promise<LocalServiceContainer>;
  isHealthy(container: LocalServiceContainer): Promise<boolean>;
  /** Create the partition's resources if needed and empty them. */
  preparePartition(container: LocalServiceContainer, partition: string): Promise<void>;
  dropPartition(container: LocalServiceContainer, partition: string): Promise<void>;
  /** Write the partition's state into an empty directory. Returns whether any state exists. */
  capture(container: LocalServiceContainer, partition: string, directory: string): Promise<boolean>;
  /** Replace the partition's state with a directory written by capture(). */
  restore(container: LocalServiceContainer, partition: string, directory: string): Promise<void>;
}

/** Endpoints and names a home needs to use one partition of every part. */
export interface PartitionEndpoints {
  partition: string;
  containers: Readonly<Record<string, LocalServiceContainer>>;
}

export interface LocalServiceConsumerContext extends PartitionEndpoints {
  homeDirectory: string;
  logsDirectory: string;
  /**
   * Opening a fixture selects local publishing providers. Restoring a
   * checkpoint keeps its captured provider choice and only rewires endpoints.
   */
  activateProviders: boolean;
  /** Values published by earlier consumers, such as the web server URL. */
  published: Record<string, string>;
  /** Ports recorded in a restored checkpoint, reused when they are free. */
  preferredPorts: Readonly<Record<string, number>>;
}

export interface StartedLocalServiceConsumer {
  /** Extra environment for the Runtime service process. */
  environment?: Record<string, string>;
  /** Values later consumers may use. */
  published?: Record<string, string>;
  /** Ports worth reusing when this saved state is opened again. */
  ports?: Record<string, number>;
  stop(): Promise<void>;
}

/**
 * Processes and home configuration that let one opened home use its
 * partition: the static web server, lambda stand-ins, provider endpoints.
 */
export interface LocalServiceConsumer {
  readonly id: string;
  start(context: LocalServiceConsumerContext): Promise<StartedLocalServiceConsumer>;
}

export interface LocalServiceExtension {
  parts: LocalServicePart[];
  consumers: LocalServiceConsumer[];
}

/** Bucket and table names allow only a small alphabet; keep partitions readable and unique. */
export function partitionResourceName(partition: string, maxLength = 63): string {
  const normalized = partition.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "partition";
  if (normalized.length <= maxLength) return normalized;
  let hash = 0;
  for (const character of partition) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  const suffix = hash.toString(36);
  return `${normalized.slice(0, maxLength - suffix.length - 1).replace(/-+$/, "")}-${suffix}`;
}
