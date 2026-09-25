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

import { describe, expect, it } from "vitest";
import {
  appPlacePath,
  describeAppPlace,
  historyPlace,
  parseAppPlace,
  placeRegistry,
} from "../../../contracts/places/index.js";
import { createPlaceRegistry } from "../../../contracts/places/grammar.js";

describe("App places", () => {
  it("round-trips a surface with parameters and a focused selection", () => {
    const place = {
      page: "bundle" as const,
      slug: "meadow-test-bundle-big",
      surface: { name: "preview", parameters: { step: "share", tab: "publish" } },
      select: [{ id: "3265a081dc61" }, { key: "/t001/new page.md" }],
    };
    const path = appPlacePath(place);
    expect(path).toBe("/bundle/meadow-test-bundle-big?surface=preview&step=share&tab=publish&select=id:3265a081dc61,key:%2Ft001%2Fnew+page.md");
    expect(parseAppPlace(path)).toEqual({ place, ignored: [] });
    expect(describeAppPlace(place)).toBe("meadow-test-bundle-big › Preview › share › publish › 2 selected");
  });

  it("accepts parameters contributed by another area to a surface", () => {
    const parsed = parseAppPlace("/bundle/b?surface=preview&customize=open&settings=okf");
    expect(parsed.place).toMatchObject({ surface: { name: "preview", parameters: { customize: "open", settings: "okf" } } });
    expect(placeRegistry.classifyDialog("Open Knowledge Format Settings", parsed.place)).toBe("surface");
  });

  it("keeps what it understands and reports the rest", () => {
    const parsed = parseAppPlace("/bundle/b?surface=preview&step=sideways&color=blue&select=id:a,bogus");
    expect(parsed.place).toEqual({ page: "bundle", slug: "b", surface: { name: "preview", parameters: {} }, select: [{ id: "a" }] });
    expect(parsed.ignored.sort()).toEqual(["color", "select bogus", "step=sideways"]);
    expect(parseAppPlace("/bundle/b?surface=node-links").ignored).toEqual(["surface=node-links (missing node)"]);
    expect(parseAppPlace("/?surface=nowhere").ignored).toEqual(["surface=nowhere"]);
    expect(() => parseAppPlace("/settings")).toThrow("Not a Meadow place");
  });

  it("refuses to build places the definitions do not allow", () => {
    expect(() => appPlacePath({ page: "bundle", slug: "b", surface: { name: "node-links", parameters: {} } })).toThrow("requires node");
    expect(() => appPlacePath({ page: "bundle", slug: "b", surface: { name: "preview", parameters: { tab: "nope" } } })).toThrow("must be one of");
  });

  it("keeps only history places when a person moves on from a link", () => {
    expect(historyPlace({ page: "bundle", slug: "b", surface: { name: "source-review", parameters: {} }, select: [{ id: "a" }] }))
      .toEqual({ page: "bundle", slug: "b" });
    expect(historyPlace({ page: "bundle", slug: "b", surface: { name: "preview", parameters: { step: "share" } } }))
      .toEqual({ page: "bundle", slug: "b", surface: { name: "preview", parameters: { step: "share" } } });
  });

  it("classifies open dialogs as surfaces, declared transients, or unaddressable", () => {
    const bundle = { page: "bundle" as const, slug: "b" };
    expect(placeRegistry.classifyDialog("Delete Bundle", bundle)).toBe("transient");
    expect(placeRegistry.classifyDialog("Manage sources", bundle)).toBe("unaddressable");
    expect(placeRegistry.classifyDialog("Manage sources", { ...bundle, surface: { name: "manage-sources", parameters: {} } })).toBe("surface");
  });

  it("refuses ambiguous grammars when the registry loads", () => {
    const surface = (name: string, description: string) => ({
      surface: name, page: "bundle" as const, title: name, history: false,
      parameters: [{ name: "node", description }],
    });
    expect(() => createPlaceRegistry([{ owner: "a", surfaces: [surface("one", "A page"), surface("two", "A filter")] }]))
      .toThrow('Place parameter "node" means different things');
    expect(() => createPlaceRegistry([{ owner: "a", surfaces: [], extensions: [{ page: "bundle", surface: "missing", parameters: [], dialogNames: [] }] }]))
      .toThrow("unknown surface");
  });
});
