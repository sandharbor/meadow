/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import fs from 'node:fs';
import path from 'node:path';
import type { BundleNodeConfig, TrackingEvidence } from '../../../../../contracts/types/bundleNodeConfig.js';
import { textDocumentCodec, writeDurableDocument } from '../../../../../shared_code/utils/durableDocument.js';

export interface TrackingRecord {
  evidence?: TrackingEvidence;
  lastReachable?: { path: string; snapshotId: string; route: string[] };
}

export function trackingRecordsPath(bundleDirectory: string): string { return path.join(bundleDirectory, 'raw/sourcing/tracking.json'); }

export function loadTrackingRecords(bundleDirectory: string): Record<string, TrackingRecord> {
  const filename = trackingRecordsPath(bundleDirectory);
  if (!fs.existsSync(filename)) return {};
  const records = JSON.parse(fs.readFileSync(filename, 'utf8')) as Record<string, TrackingRecord>;
  if (!records || typeof records !== 'object' || Array.isArray(records)) throw new Error('Invalid tracking metadata');
  return records;
}

export function saveTrackingRecords(bundleDirectory: string, records: Record<string, TrackingRecord>): void {
  const filename = trackingRecordsPath(bundleDirectory);
  const value = `${JSON.stringify(records, null, 2)}\n`;
  if (!fs.existsSync(filename) || fs.readFileSync(filename, 'utf8') !== value) {
    writeDurableDocument({ path: filename, value, codec: textDocumentCodec });
  }
}

export function hydrateTrackingEvidence(bundleDirectory: string, configs: BundleNodeConfig[]): void {
  const records = loadTrackingRecords(bundleDirectory);
  for (const config of configs) {
    if (config.bundleNodeKind === 'file' && records[config.bundleNodeId]?.evidence) {
      config.trackingEvidence = records[config.bundleNodeId].evidence;
    }
  }
}

export function separateTrackingEvidence(bundleDirectory: string, configs: BundleNodeConfig[]): BundleNodeConfig[] {
  const records = loadTrackingRecords(bundleDirectory);
  let changed = false;
  const result = configs.map(config => {
    if (config.bundleNodeKind !== 'file' || !config.trackingEvidence) return config;
    records[config.bundleNodeId] = { ...records[config.bundleNodeId], evidence: config.trackingEvidence };
    changed = true;
    const clean = { ...config };
    delete clean.trackingEvidence;
    return clean;
  });
  if (changed) saveTrackingRecords(bundleDirectory, records);
  return result;
}
