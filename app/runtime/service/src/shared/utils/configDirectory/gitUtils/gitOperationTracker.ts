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

/**
 * Simple module to track when git operations occur.
 * Used by intermittentAutoCommit to avoid overlapping with other git operations.
 */

let lastGitOperationTime: number = 0;

/**
 * Call this function whenever a git operation is performed.
 * This updates the timestamp so the intermittent auto-commit knows to wait.
 */
export function notifyGitOperation(): void {
  lastGitOperationTime = Date.now();
}

/**
 * Get the timestamp of the last git operation.
 * @returns Unix timestamp in milliseconds, or 0 if no operation has occurred.
 */
export function getLastGitOperationTime(): number {
  return lastGitOperationTime;
}
