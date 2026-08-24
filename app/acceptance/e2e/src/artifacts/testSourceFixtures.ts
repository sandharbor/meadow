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

import { existsSync, readFileSync } from "fs";
import path from "path";

export interface TestSourceFixture {
  name: string;
  content: string;
}

export interface TestSourceFixtureReference {
  name: string;
  line: number;
}

export function extractReferencedCliFixtureReferences(
  testSource: string,
): TestSourceFixtureReference[] {
  const references: TestSourceFixtureReference[] = [];
  const seen = new Set<string>();
  const fixtureCall = /\breadCliFixture\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of testSource.matchAll(fixtureCall)) {
    const name = match[1];
    if (
      name === path.basename(name) &&
      name.endsWith(".json") &&
      !seen.has(name)
    ) {
      seen.add(name);
      references.push({
        name,
        line: testSource.slice(0, match.index).split("\n").length - 1,
      });
    }
  }

  return references;
}

export function extractReferencedCliFixtureNames(testSource: string): string[] {
  return extractReferencedCliFixtureReferences(testSource).map(({ name }) => name);
}

export function readReferencedCliFixture(
  testSourceFile: string,
  testSource: string,
  name: string,
): TestSourceFixture | null {
  if (!extractReferencedCliFixtureNames(testSource).includes(name)) return null;

  const fixturesDirectory = path.resolve(path.dirname(testSourceFile), "cli-fixtures");
  const fixturePath = path.resolve(fixturesDirectory, name);
  if (path.dirname(fixturePath) !== fixturesDirectory || !existsSync(fixturePath)) {
    return null;
  }

  return { name, content: readFileSync(fixturePath, "utf8") };
}

export function collectReferencedCliFixtures(
  testSourceFile: string,
  testSource: string,
): TestSourceFixture[] {
  return extractReferencedCliFixtureNames(testSource)
    .map((name) => readReferencedCliFixture(testSourceFile, testSource, name))
    .filter((fixture): fixture is TestSourceFixture => fixture !== null);
}
