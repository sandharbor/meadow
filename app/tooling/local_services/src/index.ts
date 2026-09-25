/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

// Shared Local Services and checkpoint infrastructure for E2E and Dev Tools.

export type {
  LocalServiceConsumer,
  LocalServiceConsumerContext,
  LocalServiceContainer,
  LocalServiceExtension,
  LocalServicePart,
  PartitionEndpoints,
  StartedLocalServiceConsumer,
} from "./parts.js";
export { partitionResourceName } from "./parts.js";
export { acquireLocalServices, localServiceHolders, readLocalServices, releaseLocalServices, localServicesDirectory } from "./owner.js";
export type { AcquiredLocalServices } from "./owner.js";
export { loadLocalServices } from "./extensions.js";
export { startPartitionServices } from "./consumers.js";
export type { StartedPartitionServices } from "./consumers.js";
export { MINIO_ACCESS_KEY_ID, MINIO_SECRET_ACCESS_KEY, createMinioClient, minioBucketName } from "./minio.js";
export { activateOnlyProvider, hostedServiceReferences, mergeYaml, providerDirectory, seedS3Provider } from "./providerSeeding.js";
export { startWebServer, stopWebServer } from "./webServer.js";
export type { WebServerProcess } from "./webServer.js";
export {
  CHECKPOINT_REPO_DIRECTORY,
  captureCheckpoint,
  checkpointCompatibility,
  listCheckpoints,
  restoreCheckpoint,
} from "./checkpoints.js";
export type { CheckpointCompatibility, CheckpointMetadata, CheckpointSummary } from "./checkpoints.js";
