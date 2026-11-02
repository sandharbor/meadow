/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import fs from 'node:fs';
import path from 'node:path';
import type { GenerationInputRecord, GenerationOutputRecord } from '../../../../../contracts/types/shared/generated-bundle-versioning/generatedOutputIdentity.js';

/** Persisted generation evidence and output, addressed by version identity. */
export class GenerationRecords {
  private readonly bundle: string;
  constructor(home: string, slug: string) { this.bundle = path.join(home, 'bundles', slug); }
  private records(): string { return path.join(this.bundle, 'raw/generation_inputs'); }
  inputs(versionId: string): GenerationInputRecord {
    return JSON.parse(fs.readFileSync(path.join(this.records(), `${versionId}.json`), 'utf8'));
  }
  output(versionId: string): GenerationOutputRecord {
    return JSON.parse(fs.readFileSync(path.join(this.records(), `${versionId}.output.json`), 'utf8'));
  }
  onlyInputs(): GenerationInputRecord {
    const files = fs.readdirSync(this.records()).filter(file => file.endsWith('.json') && !file.endsWith('.output.json'));
    if (files.length !== 1) throw new Error(`Expected one generation input record, found ${files.length} at ${this.records()}`);
    return this.inputs(files[0].slice(0, -5));
  }
  onlyVersionPageText(filename: string): string {
    const root = path.join(this.bundle, 'html/generated_bundle_versions');
    const versions = fs.readdirSync(root).filter(name => /^v[A-Za-z0-9]{6}$/.test(name));
    if (versions.length !== 1) throw new Error(`Expected one generated version, found ${versions.length} at ${root}`);
    return fs.readFileSync(path.join(root, versions[0], filename), 'utf8');
  }
}
