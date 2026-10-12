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

export const MEADOW_RUNTIME_PROTOCOL = "meadow-local-v1";
export const MEADOW_RUNTIME_SESSION_ENV = "MEADOW_RUNTIME_SESSION_PATH";
export const RUNTIME_SESSION_DESCRIPTOR_SCHEMA_VERSION = 2;
export const HOME_OWNERSHIP_LOCK_SCHEMA_VERSION = 1;
export const RUNTIME_PAYLOAD_MANIFEST_SCHEMA_VERSION = 1;

export type RuntimeBuildPerspective = "standalone" | "composed";

export interface RuntimePayloadReference {
  identity: string;
  appVersion: string;
  perspective: RuntimeBuildPerspective;
}

export interface RuntimeSessionDescriptor {
  schemaVersion: typeof RUNTIME_SESSION_DESCRIPTOR_SCHEMA_VERSION;
  protocol: typeof MEADOW_RUNTIME_PROTOCOL;
  homeDirectory: string;
  instanceId: string;
  supervisorPid: number;
  runtimePid: number;
  controlPort: number;
  backendPort: number;
  frontendPort: number;
  backendUrl: string;
  controlUrl: string;
  frontendUrl: string;
  frontendOrigin: string;
  capability: string;
  payload: RuntimePayloadReference;
  state: "starting" | "ready" | "handoff-requested";
  startedAt: string;
  lastLeaseAt: string;
}

export interface HomeOwnershipLockRecord {
  schemaVersion: typeof HOME_OWNERSHIP_LOCK_SCHEMA_VERSION;
  homeDirectory: string;
  instanceId: string;
  supervisorPid: number;
  runtimePid: number | null;
  payloadIdentity: string;
  acquiredAt: string;
}

export interface RuntimeLeaseSnapshot {
  clientLeases: number;
  operationLeases: number;
}

export interface RuntimeBusyLeaseSnapshot extends RuntimeLeaseSnapshot {
  browserSessions: number;
}

export interface RuntimeAttachRequirement {
  protocol: string;
  payload: RuntimePayloadReference;
}

export type RuntimeCompatibilityDecision =
  | {
      action: "attach";
      code: "compatible";
    }
  | {
      action: "handoff";
      code: "protocol-upgrade" | "payload-upgrade" | "app-upgrade";
    }
  | {
      action: "refuse";
      code: "runtime-busy";
      message: string;
      leases: RuntimeBusyLeaseSnapshot;
    };

export interface RuntimePayloadFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface RuntimePayloadManifest {
  schemaVersion: typeof RUNTIME_PAYLOAD_MANIFEST_SCHEMA_VERSION;
  protocol: typeof MEADOW_RUNTIME_PROTOCOL;
  identity: string;
  appVersion: string;
  perspective: RuntimeBuildPerspective;
  files: RuntimePayloadFile[];
}

export interface RuntimeChildLaunchCommand {
  executable: string;
  args: string[];
  cwd: string;
  environment?: Record<string, string>;
}

export interface RuntimeSupervisorLaunchSpec {
  schemaVersion: 1;
  homeDirectory: string;
  payload: RuntimePayloadReference;
  service: RuntimeChildLaunchCommand;
  web: RuntimeChildLaunchCommand;
  idleTimeoutMs: number;
}
