/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { CustomFilterConfig } from '../../../../../contracts/types/shared/curation/customFilters.js';

/** Persisted filter policy, independently of the currently open editor or proposal. */
export class MeadowHomeFilters {
  constructor(private readonly home: string, private readonly bundleSlug: string) {}
  globalText(): string { return fs.readFileSync(path.join(this.home, 'app/global_custom_filters.json'), 'utf8'); }
  globalFilters(): CustomFilterConfig[] { return JSON.parse(this.globalText()).filters; }
  bundleFilters(): CustomFilterConfig[] {
    return JSON.parse(fs.readFileSync(path.join(this.home, 'bundles', this.bundleSlug, 'config/custom_filters.json'), 'utf8')).filters;
  }
  globalFilterNamed(name: string): CustomFilterConfig | undefined { return this.globalFilters().find(filter => filter.name === name); }
  bundleFilterNamed(name: string): CustomFilterConfig | undefined { return this.bundleFilters().find(filter => filter.name === name); }
  deletedDefaultFilterIds(): string[] {
    return YAML.parse(fs.readFileSync(path.join(this.home, 'app/app_config.yaml'), 'utf8')).deletedDefaultFilterIds ?? [];
  }
}
