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

import { createServer } from "node:net";

export async function findFreeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate a Runtime port")));
        return;
      }
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

export interface RuntimePorts {
  controlPort: number;
  backendPort: number;
  frontendPort: number;
}

export async function allocateDistinctRuntimePorts(): Promise<RuntimePorts> {
  const ports = new Set<number>();
  while (ports.size < 3) ports.add(await findFreeLoopbackPort());
  const [controlPort, backendPort, frontendPort] = [...ports];
  return { controlPort, backendPort, frontendPort };
}
