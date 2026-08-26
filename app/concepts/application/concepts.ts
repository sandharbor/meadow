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

import { coreConceptIds as id } from "../ids.js";
import { conceptLink as link, conceptText as text, defineMeadowConcept as define } from "../language.js";

export const migration = define({
  id: id.migration, name: "Meadow Home Migration", aliases: ["Migration"], kind: "process",
  definition: text`A versioned transformation that advances durable Meadow Home data to the format required by the running application.`,
  mechanics: [text`Startup recognizes pending migrations, rewrites their target data, and records successful completion before ordinary use continues.`],
  interplay: text`${link(id.startupRecovery, "Safe Startup Recovery")} owns the user-visible failure boundary when a migration cannot complete safely.`,
});

export const startupRecovery = define({
  id: id.startupRecovery, name: "Safe Startup Recovery", kind: "process",
  definition: text`The startup boundary that presents recoverable failures before the ordinary application is allowed to run.`,
  mechanics: [text`It handles invalid bootstrap data, incompatible durable formats, and interrupted migrations without pretending startup succeeded.`],
  interplay: text`It contains failures from ${link(id.migration, "Meadow Home Migration")} and preserves the durable ${link(id.meadowHome, "Meadow Home")}.`,
});

export const softwareUpdate = define({
  id: id.softwareUpdate, name: "Verified Software Update", aliases: ["Software Update"], kind: "process",
  definition: text`The desktop update flow for verifying and applying a replacement application build.`,
  mechanics: [text`Downloads are verified before replacement; failures remain safe and retryable.`],
  interplay: text`An update may introduce a new ${link(id.runtimePayload, "Runtime Payload")}, whose compatibility is resolved by ${link(id.compatibilityNegotiation, "Compatibility Negotiation")}.`,
});

export const applicationConcepts = [migration, startupRecovery, softwareUpdate] as const;
