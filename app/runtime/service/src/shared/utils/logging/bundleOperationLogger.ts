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

import { randomUUID } from 'crypto';
import {
  logBundleDebug,
  logBundleError,
  logBundleInfo,
  logBundleWarn,
} from './bundleLogger.js';

export interface BundleOperationLogger {
  operationId: string;
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

/** Create a secret-free correlation prefix shared by every line for one user operation. */
export function createBundleOperationLogger(
  bundleSlug: string,
  operationName: string,
  operationId = randomUUID(),
): BundleOperationLogger {
  const prefix = `[operation ${operationId}] [${operationName}]`;
  return {
    operationId,
    debug: message => logBundleDebug(bundleSlug, `${prefix} ${message}`),
    info: message => logBundleInfo(bundleSlug, `${prefix} ${message}`),
    warn: message => logBundleWarn(bundleSlug, `${prefix} ${message}`),
    error: message => logBundleError(bundleSlug, `${prefix} ${message}`),
  };
}
