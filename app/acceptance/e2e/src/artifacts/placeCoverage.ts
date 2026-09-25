/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseAppPlace, placeRegistry } from "../../../../contracts/places/index.js";

/**
 * Place coverage across one run. Every surface a person can reach must be
 * reached by clicking in at least one scenario; scenarios may jump to places
 * in their setup only while some other scenario still clicks its way there.
 */

export interface SurfaceCoverage {
  surface: string;
  page: string;
  title: string;
  owner: string;
  byApp: string[];
  byLink: string[];
}

export interface PlaceCoverageReport {
  surfaces: SurfaceCoverage[];
  /** Surfaces no scenario reaches by clicking. */
  missingClickPaths: SurfaceCoverage[];
}

const REACHED = /\[place\] reached (\S+) via (app|link)/;

export function computePlaceCoverage(runDirectory: string): PlaceCoverageReport {
  const surfaces = placeRegistry.surfaces.map(surface => ({
    surface: surface.surface,
    page: surface.page,
    title: surface.title,
    owner: placeRegistry.ownerOf(surface),
    byApp: new Set<string>(),
    byLink: new Set<string>(),
  }));
  const bySurface = new Map(surfaces.map(entry => [`${entry.page}:${entry.surface}`, entry]));
  for (const scenario of readdirSync(runDirectory)) {
    const log = path.join(runDirectory, scenario, "frontend.log");
    if (scenario.startsWith("__") || !statSync(path.join(runDirectory, scenario)).isDirectory() || !existsSync(log)) continue;
    for (const line of readFileSync(log, "utf8").split("\n")) {
      const match = REACHED.exec(line);
      if (!match) continue;
      let place;
      try {
        place = parseAppPlace(match[1]).place;
      } catch {
        continue;
      }
      if (!place.surface) continue;
      const entry = bySurface.get(`${place.page}:${place.surface.name}`);
      if (!entry) continue;
      (match[2] === "app" ? entry.byApp : entry.byLink).add(scenario);
    }
  }
  const report = surfaces.map(entry => ({ ...entry, byApp: [...entry.byApp].sort(), byLink: [...entry.byLink].sort() }));
  return { surfaces: report, missingClickPaths: report.filter(entry => entry.byApp.length === 0) };
}

/**
 * Write the report into the run and, for a full run, fail when any surface
 * lacks a click path. Filtered runs report without enforcing.
 */
export function reportPlaceCoverage(runDirectory: string, enforce: boolean): boolean {
  if (!existsSync(runDirectory)) return true;
  const report = computePlaceCoverage(runDirectory);
  writeFileSync(path.join(runDirectory, "__place-coverage.json"), `${JSON.stringify(report, null, 2)}\n`);
  const reachable = report.surfaces.length - report.missingClickPaths.length;
  console.log(`\nApp Place coverage: ${reachable}/${report.surfaces.length} surfaces reached by clicking in some scenario.`);
  for (const entry of report.missingClickPaths) {
    const how = entry.byLink.length > 0 ? `only by link (${entry.byLink.length} scenario${entry.byLink.length === 1 ? "" : "s"})` : "never";
    console.log(`  ${enforce ? "✘" : "·"} ${entry.page}:${entry.surface} (${entry.title}, ${entry.owner}) is reached ${how}; no scenario reaches it by clicking.`);
  }
  return !enforce || report.missingClickPaths.length === 0;
}
