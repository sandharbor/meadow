/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { minioBucketName, minioPart } from "./minio.js";
import type { LocalServiceConsumer, LocalServiceExtension } from "./parts.js";
import { seedS3Provider } from "./providerSeeding.js";
import { startWebServer, stopWebServer } from "./webServer.js";

/**
 * Extensions mount their Local Services beside their acceptance fixtures. The
 * open core runs without them; when mounted, their parts join every holder.
 */
const EXTENSION_MODULE = path.resolve(
  import.meta.dirname,
  "../../../acceptance/e2e/src/run/meadow-extension/localServices.ts",
);

/** Serve the partition's bucket and point the S3 provider at it. */
export const webConsumer: LocalServiceConsumer = {
  id: "web",
  async start(context) {
    const minio = context.containers.minio;
    const minioBucket = minioBucketName(context.partition);
    const server = await startWebServer({
      minioEndpoint: minio.endpoint,
      minioBucket,
      port: context.preferredPorts.webServer,
    });
    const webBaseUrl = `http://localhost:${server.port}`;
    seedS3Provider(context.homeDirectory, { minioEndpoint: minio.endpoint, minioBucket, webBaseUrl }, { activate: context.activateProviders });
    return {
      published: { minioEndpoint: minio.endpoint, minioBucket, webBaseUrl, webServerPort: String(server.port) },
      ports: { webServer: server.port },
      stop: () => stopWebServer(server.process),
    };
  },
};

let loaded: Promise<LocalServiceExtension> | undefined;

export function loadLocalServices(): Promise<LocalServiceExtension> {
  loaded ??= (async () => {
    const base: LocalServiceExtension = { parts: [minioPart], consumers: [webConsumer] };
    if (!fs.existsSync(EXTENSION_MODULE)) return base;
    const extension = await import(pathToFileURL(fs.realpathSync(EXTENSION_MODULE)).href) as { localServiceExtension: LocalServiceExtension };
    return {
      parts: [...base.parts, ...extension.localServiceExtension.parts],
      consumers: [...base.consumers, ...extension.localServiceExtension.consumers],
    };
  })();
  return loaded;
}
