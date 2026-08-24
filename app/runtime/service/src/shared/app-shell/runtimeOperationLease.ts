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

import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

interface RuntimeOperationLeaseOptions {
  controlUrl?: string;
  capability?: string;
}

async function changeLease(
  controlUrl: string,
  capability: string,
  action: 'acquire' | 'release',
  leaseId: string,
): Promise<void> {
  const response = await globalThis.fetch(`${controlUrl}/lease/operation/${action}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-meadow-capability': capability,
    },
    body: JSON.stringify({ leaseId }),
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) {
    throw new Error(`Runtime operation lease ${action} failed (${response.status})`);
  }
}

export function createRuntimeOperationLeaseMiddleware(options: RuntimeOperationLeaseOptions) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (
      request.method === 'GET'
      || request.method === 'HEAD'
      || request.method === 'OPTIONS'
      || !options.controlUrl
      || !options.capability
    ) {
      next();
      return;
    }

    void (async () => {
      const leaseId = `${process.pid}-${randomUUID()}`;
      try {
        await changeLease(options.controlUrl!, options.capability!, 'acquire', leaseId);
      } catch {
        response.status(503).json({ error: 'Runtime Supervisor could not protect this operation.' });
        return;
      }

      let released = false;
      const release = (): void => {
        if (released) return;
        released = true;
        void changeLease(options.controlUrl!, options.capability!, 'release', leaseId).catch(() => {});
      };
      response.once('finish', release);
      response.once('close', release);
      next();
    })();
  };
}
