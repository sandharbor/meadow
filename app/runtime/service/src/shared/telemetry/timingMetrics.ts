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

import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { getLogDirectory } from '../utils/logging/backendLoggingUtils.js';

type TimingLabelValue = string | number | boolean | null | undefined;

export interface TimingLabels {
  [key: string]: TimingLabelValue;
}

export interface TimingMetric {
  version: 1;
  type: 'timing';
  timestamp: string;
  name: string;
  durationMs: number;
  status: 'ok' | 'error';
  labels?: Record<string, string | number | boolean>;
  errorName?: string;
}

function cleanLabels(labels?: TimingLabels): Record<string, string | number | boolean> | undefined {
  if (!labels) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(labels)) {
    if (value === null || value === undefined) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function telemetryFilePath(): string {
  return path.join(getLogDirectory(), 'telemetry.jsonl');
}

export function recordTimingMetric(
  name: string,
  durationMs: number,
  labels?: TimingLabels,
  status: 'ok' | 'error' = 'ok',
  error?: unknown
): void {
  const metric: TimingMetric = {
    version: 1,
    type: 'timing',
    timestamp: new Date().toISOString(),
    name,
    durationMs,
    status,
    ...(cleanLabels(labels) && { labels: cleanLabels(labels) }),
    ...(error instanceof Error && { errorName: error.name }),
  };

  try {
    const filePath = telemetryFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, `${JSON.stringify(metric)}\n`, 'utf8');
  } catch {
    // Telemetry must never affect app behavior.
  }
}

export async function timeAsync<T>(
  name: string,
  labels: TimingLabels | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    recordTimingMetric(name, performance.now() - start, labels, 'ok');
    return result;
  } catch (error) {
    recordTimingMetric(name, performance.now() - start, labels, 'error', error);
    throw error;
  }
}

export function timeSync<T>(
  name: string,
  labels: TimingLabels | undefined,
  fn: () => T
): T {
  const start = performance.now();
  try {
    const result = fn();
    recordTimingMetric(name, performance.now() - start, labels, 'ok');
    return result;
  } catch (error) {
    recordTimingMetric(name, performance.now() - start, labels, 'error', error);
    throw error;
  }
}
