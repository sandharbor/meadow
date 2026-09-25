/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { loadLocalServices } from "./extensions.js";
import type { LocalServiceConsumerContext, LocalServiceContainer } from "./parts.js";
import type { localServices, ParticipatesIn } from "../../../concepts/index.js";

export interface StartedPartitionServices {
  /** Extra environment for the Runtime service process. */
  environment: Record<string, string>;
  /** Named values such as the web base URL and bucket. */
  published: Record<string, string>;
  /** Ports to prefer when this saved state is opened again. */
  ports: Record<string, number>;
  stop(): Promise<void>;
}

/**
 * Start every consumer for one opened home, in order, so later consumers can
 * use values published by earlier ones. A failed start stops what began.
 */
export async function startPartitionServices(options: {
  partition: string;
  containers: Readonly<Record<string, LocalServiceContainer>>;
  homeDirectory: string;
  logsDirectory: string;
  activateProviders: boolean;
  preferredPorts?: Readonly<Record<string, number>>;
}): Promise<StartedPartitionServices> {
  const { consumers } = await loadLocalServices();
  const started: { stop(): Promise<void> }[] = [];
  const environment: Record<string, string> = {};
  const published: Record<string, string> = {};
  const ports: Record<string, number> = {};
  const stop = async () => {
    for (const consumer of started.reverse()) await consumer.stop();
  };
  try {
    for (const consumer of consumers) {
      const context: LocalServiceConsumerContext = {
        partition: options.partition,
        containers: options.containers,
        homeDirectory: options.homeDirectory,
        logsDirectory: options.logsDirectory,
        activateProviders: options.activateProviders,
        published: { ...published },
        preferredPorts: options.preferredPorts ?? {},
      };
      const result = await consumer.start(context);
      started.push(result);
      Object.assign(environment, result.environment);
      Object.assign(published, result.published);
      Object.assign(ports, result.ports);
    }
  } catch (error) {
    await stop();
    throw error;
  }
  return { environment, published, ports, stop };
}

export type LocalServicesPartitionMeadowConceptParticipations = [
  ParticipatesIn<typeof localServices, "serve-partition", typeof startPartitionServices>,
];
