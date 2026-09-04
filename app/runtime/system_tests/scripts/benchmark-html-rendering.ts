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

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { Session } from 'node:inspector/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import type { TimingMetric } from '../../service/src/shared/telemetry/timingMetrics.js';

const { values } = parseArgs({ options: {
  fixture: { type: 'string', default: 'big' },
  runs: { type: 'string', default: '7' },
  warmup: { type: 'string', default: '2' },
  output: { type: 'string' },
  profile: { type: 'string' },
} });
const fixtures = {
  big: ['home_fixture_big_and_small', 'meadow-test-bundle-big'],
  example: ['home_fixture_example', 'example-bundle'],
  hooks: ['home_fixture_hooks', 'meadow-test-bundle-for-hooks'],
} as const;
assert(Object.hasOwn(fixtures, values.fixture), 'fixture must be big, example, or hooks');
const runs = Number(values.runs);
const warmup = Number(values.warmup);
assert(Number.isInteger(runs) && runs > 0, 'runs must be a positive integer');
assert(Number.isInteger(warmup) && warmup >= 0, 'warmup must be a nonnegative integer');

// Use the same isolated fixture setup as the preview system tests. Import the
// backend only after selecting the temporary home, so personal settings and
// hooks cannot influence the measurement.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'meadow-render-benchmark-'));
process.env.MEADOW_HOME_DIRECTORY_OVERRIDE = home;
process.env.MEADOW_SYSTEM_TEST_CONFIG_DIR = home;
process.env.MEADOW_LOG_DIRECTORY_OVERRIDE = path.join(home, 'logs');
const { SystemTestBundleSetup } = await import('../helpers/testSetup.js');
const { generateHtmlForBundle } = await import('../../service/src/areas/bundle/generation/html/htmlService.js');
const { ensureTrackedPageContent } = await import('../../service/src/areas/bundle/generation/source-material/trackedPageContent.js');
const { logger, LogLevel } = await import('../../service/src/shared/utils/logging/backendLoggingUtils.js');
logger.setLevel(LogLevel.Error);
const [fixture, bundleFolderName] = fixtures[values.fixture as keyof typeof fixtures];
const setup = new SystemTestBundleSetup(fixture, 'render-benchmark', { bundleFolderName });
const telemetryPath = path.join(home, 'logs', 'telemetry.jsonl');

function htmlDigest(directory: string): { pages: number; sha256: string } {
  const hash = createHash('sha256');
  const files = fs.readdirSync(directory, { recursive: true })
    .map(String).filter(file => file.endsWith('.html')).sort();
  assert(files.length > 0, 'generation must produce HTML pages');
  for (const file of files) {
    hash.update(file).update('\0').update(fs.readFileSync(path.join(directory, file))).update('\0');
  }
  return { pages: files.length, sha256: hash.digest('hex') };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const samples: Array<{ totalMs: number; cpuMs: number; stages: Record<string, number> }> = [];
let output: ReturnType<typeof htmlDigest> | undefined;
const profiler = values.profile ? new Session() : undefined;
try {
  setup.setUp();
  await ensureTrackedPageContent(setup.getBundlePath(), setup.getSourceGraphPath());
  const outputDirectory = setup.getPathInBundle('html/generated_bundle_versions/vBench1');
  for (let i = 0; i < warmup + runs; i++) {
    if (i === warmup && profiler) {
      profiler.connect();
      await profiler.post('Profiler.enable');
      await profiler.post('Profiler.start');
    }
    fs.mkdirSync(path.dirname(telemetryPath), { recursive: true });
    fs.writeFileSync(telemetryPath, '');
    const cpuStart = process.cpuUsage();
    const start = performance.now();
    await generateHtmlForBundle(setup.getBundlePath(), { preview: true, outputDirectory });
    const totalMs = performance.now() - start;
    const cpu = process.cpuUsage(cpuStart);
    const metrics = fs.readFileSync(telemetryPath, 'utf8').trim().split('\n')
      .map(line => JSON.parse(line) as TimingMetric);
    const stages: Record<string, number> = {};
    for (const metric of metrics) {
      if (metric.name === 'bundle.generation.stage' && typeof metric.labels?.stage === 'string') {
        stages[metric.labels.stage] = (stages[metric.labels.stage] ?? 0) + metric.durationMs;
      }
    }
    const digest = htmlDigest(outputDirectory);
    if (output) assert.deepEqual(digest, output, 'HTML output changed between repetitions');
    output = digest;
    if (i >= warmup) samples.push({ totalMs, cpuMs: (cpu.user + cpu.system) / 1000, stages });
    console.log(`${i < warmup ? 'warmup' : 'sample'} ${i + 1}: ${totalMs.toFixed(1)} ms (${digest.pages} HTML pages)`);
  }
  if (profiler && values.profile) {
    const { profile } = await profiler.post('Profiler.stop');
    fs.writeFileSync(path.resolve(values.profile), JSON.stringify(profile));
  }
  const report = {
    fixture: values.fixture,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    runs, warmup, output,
    medianMs: median(samples.map(sample => sample.totalMs)),
    medianCpuMs: median(samples.map(sample => sample.cpuMs)),
    medianStagesMs: Object.fromEntries(Object.keys(samples[0].stages)
      .map(stage => [stage, median(samples.map(sample => sample.stages[stage] ?? 0))])),
    samples,
  };
  console.log(JSON.stringify(report, null, 2));
  if (values.output) fs.writeFileSync(path.resolve(values.output), `${JSON.stringify(report, null, 2)}\n`);
} finally {
  profiler?.disconnect();
  setup.tearDown();
  fs.rmSync(home, { recursive: true, force: true });
}
