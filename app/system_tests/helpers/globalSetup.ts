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

import { execSync } from 'child_process';

const TEST_PORT = 3099;

/**
 * Global setup that runs once before all tests.
 * Kills any stale server processes from previous test runs.
 */
export default async function globalSetup(): Promise<void> {
  try {
    // Use lsof to find LISTENING process(es) on the test port.
    // IMPORTANT: only kill listeners, not client connections (which could include the Jest process).
    const result = execSync(`lsof -tiTCP:${TEST_PORT} -sTCP:LISTEN`, { encoding: 'utf8' });
    const pids = result.trim().split('\n').filter(Boolean);
    
    if (pids.length > 0) {
      console.log(`Found stale server process(es) on port ${TEST_PORT}, killing...`);
      for (const pid of pids) {
        try {
          process.kill(parseInt(pid, 10), 'SIGKILL');
        } catch {
          // Process might have already exited
        }
      }
      // Wait for port to be released
      await new Promise(r => setTimeout(r, 500));
      console.log('Stale server killed');
    }
  } catch {
    // lsof returns non-zero if no process is on the port, which is fine
  }
}

