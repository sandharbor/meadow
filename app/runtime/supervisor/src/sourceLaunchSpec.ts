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

import path from "node:path";
import type {
  RuntimeBuildPerspective,
  RuntimeSupervisorLaunchSpec,
} from "../../../contracts/types/runtime.js";

export interface SourceRuntimeLaunchOptions {
  projectRoot: string;
  homeDirectory: string;
  appVersion: string;
  payloadIdentity: string;
  perspective: RuntimeBuildPerspective;
  idleTimeoutMs?: number;
}

export function createSourceRuntimeLaunchSpec(
  options: SourceRuntimeLaunchOptions,
): RuntimeSupervisorLaunchSpec {
  const projectRoot = path.resolve(options.projectRoot);
  const serviceDirectory = path.join(projectRoot, "app", "runtime", "service");
  const webDirectory = path.join(projectRoot, "app", "clients", "web");
  return {
    schemaVersion: 1,
    homeDirectory: path.resolve(options.homeDirectory),
    payload: {
      identity: options.payloadIdentity,
      appVersion: options.appVersion,
      perspective: options.perspective,
    },
    service: {
      executable: path.join(serviceDirectory, "node_modules", ".bin", "tsx"),
      args: ["src/shared/app-shell/index.ts"],
      cwd: serviceDirectory,
      environment: {
        NODE_ENV: "production",
        MEADOW_IS_DEV: "true",
      },
    },
    web: {
      executable: path.join(webDirectory, "node_modules", ".bin", "vite"),
      args: [],
      cwd: webDirectory,
    },
    idleTimeoutMs: options.idleTimeoutMs ?? 30_000,
  };
}
