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

import type { RuntimeLeaseSnapshot } from "../../../contracts/types/runtime.js";
import type { lease, ParticipatesIn } from "../../../concepts/index.js";

export type RuntimeLeaseKind = "client" | "operation";

export class RuntimeLeaseRegistry {
  private readonly clientLeases = new Map<string, number | null>();
  private readonly operationLeases = new Set<string>();
  private lastActivity = Date.now();

  acquire(kind: RuntimeLeaseKind, leaseId: string, clientPid?: number): RuntimeLeaseSnapshot {
    this.requireLeaseId(leaseId);
    if (kind === "client") {
      if (clientPid !== undefined && (!Number.isInteger(clientPid) || clientPid < 1)) {
        throw new Error("A valid clientPid is required when one is supplied");
      }
      this.clientLeases.set(leaseId, clientPid ?? null);
    } else {
      this.operationLeases.add(leaseId);
    }
    this.lastActivity = Date.now();
    return this.snapshot();
  }

  release(kind: RuntimeLeaseKind, leaseId: string): RuntimeLeaseSnapshot {
    this.requireLeaseId(leaseId);
    if (kind === "client") this.clientLeases.delete(leaseId);
    else this.operationLeases.delete(leaseId);
    this.lastActivity = Date.now();
    return this.snapshot();
  }

  snapshot(): RuntimeLeaseSnapshot {
    return {
      clientLeases: this.clientLeases.size,
      operationLeases: this.operationLeases.size,
    };
  }

  isIdleFor(now: number, idleTimeoutMs: number): boolean {
    const leases = this.snapshot();
    return leases.clientLeases === 0
      && leases.operationLeases === 0
      && now - this.lastActivity >= idleTimeoutMs;
  }

  touch(now = Date.now()): void {
    this.lastActivity = now;
  }

  reapDeadClientLeases(isProcessAlive: (pid: number) => boolean): number {
    let reaped = 0;
    for (const [leaseId, clientPid] of this.clientLeases) {
      if (clientPid !== null && !isProcessAlive(clientPid)) {
        this.clientLeases.delete(leaseId);
        reaped += 1;
      }
    }
    if (reaped > 0) this.lastActivity = Date.now();
    return reaped;
  }

  private requireLeaseId(leaseId: string): void {
    if (!leaseId || leaseId.length > 200) throw new Error("A bounded Runtime leaseId is required");
  }
}

export type RuntimeLeaseMeadowConceptParticipations = [
  ParticipatesIn<typeof lease, "track-liveness", typeof RuntimeLeaseRegistry>,
];
