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

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MEADOW_RUNTIME_PROTOCOL,
  RUNTIME_PAYLOAD_MANIFEST_SCHEMA_VERSION,
  type RuntimePayloadFile,
  type RuntimePayloadManifest,
  type RuntimeSupervisorLaunchSpec,
} from "../../../contracts/types/runtime.js";
import type {
  ParticipatesIn,
  runtimePayload,
} from "../../../concepts/index.js";

function parsePayloadFile(value: unknown): RuntimePayloadFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Runtime Payload file record");
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.path !== "string"
    || candidate.path.length === 0
    || path.isAbsolute(candidate.path)
    || candidate.path.split("/").includes("..")
    || !Number.isInteger(candidate.bytes)
    || Number(candidate.bytes) < 0
    || typeof candidate.sha256 !== "string"
    || !/^[a-f0-9]{64}$/.test(candidate.sha256)
  ) {
    throw new Error("Invalid Runtime Payload file record fields");
  }
  return {
    path: candidate.path,
    bytes: Number(candidate.bytes),
    sha256: candidate.sha256,
  };
}

export function parseRuntimePayloadManifest(value: unknown): RuntimePayloadManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Runtime Payload manifest");
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== RUNTIME_PAYLOAD_MANIFEST_SCHEMA_VERSION
    || candidate.protocol !== MEADOW_RUNTIME_PROTOCOL
    || typeof candidate.identity !== "string"
    || !/^sha256:[a-f0-9]{64}$/.test(candidate.identity)
    || typeof candidate.appVersion !== "string"
    || candidate.appVersion.length === 0
    || (candidate.perspective !== "standalone" && candidate.perspective !== "composed")
    || !Array.isArray(candidate.files)
  ) {
    throw new Error("Invalid Runtime Payload manifest fields");
  }
  const files = candidate.files.map(parsePayloadFile);
  if (files.some((file, index) => index > 0 && files[index - 1].path >= file.path)) {
    throw new Error("Runtime Payload file records must be unique and sorted");
  }
  return {
    schemaVersion: RUNTIME_PAYLOAD_MANIFEST_SCHEMA_VERSION,
    protocol: MEADOW_RUNTIME_PROTOCOL,
    identity: candidate.identity,
    appVersion: candidate.appVersion,
    perspective: candidate.perspective,
    files,
  };
}

export function readRuntimePayloadManifest(payloadRoot: string): RuntimePayloadManifest {
  return parseRuntimePayloadManifest(JSON.parse(
    readFileSync(path.join(payloadRoot, "manifest.json"), "utf8"),
  ));
}

export function createRuntimePayloadLaunchSpec(options: {
  payloadRoot: string;
  homeDirectory: string;
  idleTimeoutMs?: number;
}): RuntimeSupervisorLaunchSpec {
  const payloadRoot = path.resolve(options.payloadRoot);
  const manifest = readRuntimePayloadManifest(payloadRoot);
  const nodeExecutable = path.join(payloadRoot, "bin/node");
  return {
    schemaVersion: 1,
    homeDirectory: path.resolve(options.homeDirectory),
    payload: {
      identity: manifest.identity,
      appVersion: manifest.appVersion,
      perspective: manifest.perspective,
    },
    service: {
      executable: nodeExecutable,
      args: ["dist/runtime/service/src/shared/app-shell/index.js"],
      cwd: path.join(payloadRoot, "service"),
      environment: {
        NODE_ENV: "production",
        MEADOW_IS_DEV: "false",
        SOURCE_PAGE_SEARCH_BY_TITLE_PATH: path.join(payloadRoot, "native/source_page_search_by_title_bin"),
        FAST_GIT_OPS_PATH: path.join(payloadRoot, "native/fast_git_ops_bin"),
        WORKING_GRAPH_PATH: path.join(payloadRoot, "native/working_graph_bin"),
        MEADOW_EXAMPLE_BUNDLE_PATH: path.join(payloadRoot, "example"),
      },
    },
    web: {
      executable: nodeExecutable,
      args: ["server.js"],
      cwd: path.join(payloadRoot, "web"),
      environment: { NODE_ENV: "production" },
    },
    idleTimeoutMs: options.idleTimeoutMs ?? 30_000,
  };
}

export type RuntimePayloadMeadowConceptParticipations = [
  ParticipatesIn<typeof runtimePayload, "build-launch-spec", typeof createRuntimePayloadLaunchSpec>,
];
