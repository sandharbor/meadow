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
  RuntimeBusyLeaseSnapshot,
  RuntimeLeaseSnapshot,
  RuntimeSessionDescriptor,
} from "../../../contracts/types/runtime.js";
import type {
  compatibilityNegotiation,
  cooperativeHandoff,
  ParticipatesIn,
} from "../../../concepts/index.js";

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
  leases: RuntimeLeaseSnapshot & { browserSessions?: number },
): RuntimeCompatibilityDecision {
  const handoffCode = requiredHandoffCode(current, requested);
  if (!handoffCode) return { action: "attach", code: "compatible" };
  if (leases.clientLeases > 0 || leases.operationLeases > 0) {
    return {
      action: "refuse",
      code: "runtime-busy",
      message: "The active Runtime is busy. Close connected clients or wait for the current operation before upgrading.",
      leases: {
        clientLeases: leases.clientLeases,
        operationLeases: leases.operationLeases,
        browserSessions: leases.browserSessions ?? 0,
      } satisfies RuntimeBusyLeaseSnapshot,
    };
  }
  return { action: "handoff", code: handoffCode };
}

export type RuntimeCompatibilityMeadowConceptParticipations = [
  ParticipatesIn<typeof compatibilityNegotiation, "decide", typeof decideRuntimeCompatibility>,
  ParticipatesIn<typeof cooperativeHandoff, "compatibility-decision", typeof decideRuntimeCompatibility>,
];
