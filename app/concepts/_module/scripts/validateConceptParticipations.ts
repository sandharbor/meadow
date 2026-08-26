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

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { allCoreConcepts } from "../../index.js";

const appRoot = path.resolve(import.meta.dirname, "../../..");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (["node_modules", "dist", ".git", "concepts", "meadow-extension"].includes(entry.name)) return [];
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
  });
}

const sources = sourceFiles(appRoot).map(file => ({ file, text: readFileSync(file, "utf8") }));
const participationSources = sources.filter(source => source.text.includes("ParticipatesIn<"));
const errors: string[] = [];

for (const concept of allCoreConcepts) {
  for (const role of concept.implementationRoles ?? []) {
    const quotedRole = role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rolePattern = new RegExp(`ParticipatesIn\\s*<[^>]*["']${quotedRole}["']`, "s");
    if (!participationSources.some(source => rolePattern.test(source.text))) {
      errors.push(`concept "${concept.id}" has no inline participant for role "${role}"`);
    }
  }
}

for (const source of participationSources) {
  const relative = path.relative(appRoot, source.file);
  if (!/type\s+\w*MeadowConceptParticipations\s*=/.test(source.text)) {
    errors.push(`${relative} uses ParticipatesIn without a MeadowConceptParticipations declaration`);
  }
  if (/import\s+(?!type\b)[^;]*from\s*["'][^"']*concepts/.test(source.text)) {
    errors.push(`${relative} has a production import from the concept registry; use import type`);
  }
}

if (errors.length > 0) {
  throw new Error(`Invalid MeadowConcept participation:\n- ${errors.join("\n- ")}`);
}

const roleCount = allCoreConcepts.reduce(
  (count, concept) => count + (concept.implementationRoles?.length ?? 0),
  0,
);
console.log(`Concept participation passed: ${roleCount} roles in ${participationSources.length} implementation files.`);
