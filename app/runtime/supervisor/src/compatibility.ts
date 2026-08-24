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

import type {
  RuntimeAttachRequirement,
  RuntimeCompatibilityDecision,
  RuntimeLeaseSnapshot,
  RuntimeSessionDescriptor,
} from "../../../contracts/types/runtime.js";

function requiredHandoffCode(
  current: RuntimeSessionDescriptor,
  requested: RuntimeAttachRequirement,
): "protocol-upgrade" | "payload-upgrade" | "app-upgrade" | null {
  if (current.protocol !== requested.protocol) return "protocol-upgrade";
  if (current.payload.appVersion !== requested.payload.appVersion) return "app-upgrade";
  if (current.payload.identity !== requested.payload.identity) return "payload-upgrade";
  return null;
}

export function decideRuntimeCompatibility(
  current: RuntimeSessionDescriptor,
  requested: RuntimeAttachRequirement,
  leases: RuntimeLeaseSnapshot,
): RuntimeCompatibilityDecision {
  const handoffCode = requiredHandoffCode(current, requested);
  if (!handoffCode) return { action: "attach", code: "compatible" };
  if (leases.clientLeases > 0 || leases.operationLeases > 0) {
    return {
      action: "refuse",
      code: "runtime-busy",
      message: "The active Runtime is busy. Close connected clients or wait for the current operation before upgrading.",
    };
  }
  return { action: "handoff", code: handoffCode };
}
