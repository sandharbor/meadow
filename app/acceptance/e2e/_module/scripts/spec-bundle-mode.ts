/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { BUNDLE_MODES } from '../../src/run/bundleMode.js';

export function auditBundleMode(source: string) {
  const declaration = /\btest\.use\(\{\s*bundleMode:\s*["']([^"']+)["']\s*\}\);/g;
  const values = [...source.matchAll(declaration)].map(match => match[1]);
  if (values.length !== 1) return { issues: [`expected exactly one standalone test.use({ bundleMode: "..." }) declaration, found ${values.length}`] };
  const mode = values[0];
  if (!BUNDLE_MODES.includes(mode as (typeof BUNDLE_MODES)[number])) return { issues: [`unsupported bundle mode "${mode}"`] };
  return { issues: [], mode: mode as (typeof BUNDLE_MODES)[number] };
}
