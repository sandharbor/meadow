/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { Expect, Page } from "@playwright/test";
import { appPlacePath, parseAppPlace, placeRegistry, type AppPlace } from "../../../../contracts/places/index.js";
import { AppPlace as AppPlacePage } from "./pages/shared/AppPlace.js";
import { FilterPanelComponent } from "./pages/BundleEditorPage/components/FilterPanelComponent.js";

/**
 * A place to open from its link. Places that depend on state a link does not
 * carry, such as active filters, prepare it first and follow the link within
 * the running app, as a desktop meadow:// link arrives.
 */
export type PlaceExample = AppPlace | { place: AppPlace; prepare(page: Page, expect: Expect): Promise<void> };

/**
 * One example link per declared surface, in the big-and-small fixture. The
 * link-check scenarios open every surface from its link; a surface declared
 * without an example here fails them, so new surfaces are covered.
 */
export function placeExamples(options: { sourceGraphsDir: string }): Record<string, PlaceExample[]> {
  const bundle = "meadow-test-bundle-big";
  const at = (surface: string, parameters: Record<string, string> = {}, select?: { id: string }[]): AppPlace =>
    ({ page: "bundle", slug: bundle, surface: { name: surface, parameters }, ...(select && { select }) });
  const listAt = (surface: string, parameters: Record<string, string> = {}): AppPlace =>
    ({ page: "bundle-list", surface: { name: surface, parameters } });
  return {
    "bundle-list:find": [listAt("find", { vault: `${options.sourceGraphsDir}/meadow-test-bundles-data`, folder: "", page: "main page" })],
    "bundle-list:create-bundle": [listAt("create-bundle")],
    "bundle-list:edit-bundle": [listAt("edit-bundle", { bundle })],
    "bundle-list:repair-folder": [listAt("repair-folder", { bundle })],
    "bundle-list:rename-bundle": [listAt("rename-bundle", { bundle })],
    "bundle:preview": [
      at("preview", { step: "share", tab: "local-export" }),
      at("preview", { step: "review", tab: "bundle-preview", customize: "open", prompt: "agent" }),
      at("preview", { step: "review", tab: "bundle-preview", customize: "open", hook: "bundle:markdownProcessing" }),
      at("preview", { step: "review", tab: "bundle-preview", customize: "open", asset: "bundle:style_css" }),
    ],
    "bundle:bundle-logs": [at("bundle-logs")],
    "bundle:rename": [at("rename")],
    "bundle:edit-details": [at("edit-details")],
    "bundle:source-review": [at("source-review")],
    "bundle:manage-sources": [at("manage-sources", { mode: "manage" })],
    "bundle:source-snapshots": [at("source-snapshots")],
    "bundle:node-links": [at("node-links", { node: "/main page.md" })],
    "bundle:traversal-details": [at("traversal-details", { node: "t001/t001 ---- child 1.md" })],
    "bundle:custom-filter": [at("custom-filter")],
    "bundle:filter-mix": [{
      place: at("filter-mix"),
      prepare: async (page, expect) => {
        await page.goto(`/bundle/${bundle}`);
        const filterPanel = new FilterPanelComponent(page, expect);
        await filterPanel.enableAndSoloFilter("Untracked");
        await filterPanel.clickSoloOnFilter("Sensitive");
      },
    }],
    "bundle:copy-selection": [at("copy-selection", {}, [{ id: "ef63f962db68" }])],
  };
}

/** Open each place from its link and require the app to report reaching it. */
export async function checkPlaceLinks(page: Page, expect: Expect, examples: PlaceExample[]): Promise<void> {
  const appPlace = new AppPlacePage(page, expect);
  const failures: string[] = [];
  for (const example of examples) {
    const place = "place" in example ? example.place : example;
    const path = appPlacePath(place);
    if ("prepare" in example) {
      await example.prepare(page, expect);
      await appPlace.followInApp(path);
    } else {
      await appPlace.open(path);
    }
    const reachedRequested = async () => {
      const current = await appPlace.current();
      if (!current) return false;
      const reached = parseAppPlace(current).place;
      if (reached.page !== place.page || reached.surface?.name !== place.surface?.name) return false;
      const parametersReached = Object.entries(place.surface?.parameters ?? {})
        .every(([name, value]) => reached.surface?.parameters[name] === value);
      const selection = (candidate: AppPlace) => JSON.stringify(candidate.page === "bundle" ? candidate.select ?? [] : []);
      return parametersReached && selection(reached) === selection(place);
    };
    try {
      await expect.poll(reachedRequested, { timeout: 15_000 }).toBe(true);
      await appPlace.expectNoArrivalCallout();
      // Let the place finish loading, so the next link does not cut off its requests.
      await page.waitForLoadState("networkidle");
    } catch {
      failures.push(`${path} reached ${await appPlace.current()}`);
    }
  }
  expect(failures, "every surface opens from its link").toEqual([]);
}

/** The examples for these surface keys, requiring one for every declared surface. */
export function placesFor(examples: Record<string, PlaceExample[]>, keys: (key: string) => boolean): PlaceExample[] {
  const declared = placeRegistry.surfaces.map(surface => `${surface.page}:${surface.surface}`).filter(keys);
  const missing = declared.filter(key => !examples[key]);
  if (missing.length > 0) throw new Error(`Add example links for ${missing.join(", ")} in placeLinkCheck.ts`);
  return declared.flatMap(key => examples[key]);
}
