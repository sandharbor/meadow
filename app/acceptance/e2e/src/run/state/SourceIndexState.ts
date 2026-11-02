/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MeadowHomeBundleConfig } from '../utils/MeadowHomeBundleConfig.js';
import type { Expect } from '@playwright/test';

/** Native source-index evidence used to distinguish a rebuild from a cached scan. */
export class SourceIndexState {
  readonly sourceRoot: string;
  readonly diagnosticsPath: string;
  constructor(home: string, bundleSlug: string, expect: Expect) {
    const directory = new MeadowHomeBundleConfig(home, bundleSlug, expect).read().sourceDirectory;
    if (!directory) throw new Error(`Expected a source directory for ${bundleSlug}`);
    this.sourceRoot = fs.realpathSync(directory);
    const key = createHash('sha256').update(this.sourceRoot).digest('hex');
    this.diagnosticsPath = path.join(home, 'cache/source-index', key, 'last-run.json');
  }
  get current(): { sourceRoot: string; completedAtNanos: number; metrics: { cacheRebuilt: boolean; filesRead: number; indexedFiles: number } } {
    return JSON.parse(fs.readFileSync(this.diagnosticsPath, 'utf8'));
  }
}
