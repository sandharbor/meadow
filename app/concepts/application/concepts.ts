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
  id: id.migration, name: "Meadow Home Migration", aliases: ["Migration"], kind: "process", searchFacet: true,
  definition: text`A versioned transformation that advances durable Meadow Home data to the format required by the running application.`,
  mechanics: [text`Startup recognizes pending migrations, rewrites their target data, and records successful completion before ordinary use continues.`],
  interplay: text`${link(id.startupRecovery, "Safe Startup Recovery")} owns the user-visible failure boundary when a migration cannot complete safely.`,
});

export const startupRecovery = define({
  id: id.startupRecovery, name: "Safe Startup Recovery", kind: "process", searchFacet: true,
  definition: text`The startup boundary that presents recoverable failures before the ordinary application is allowed to run.`,
  mechanics: [text`It handles invalid bootstrap data, incompatible durable formats, and interrupted migrations without pretending startup succeeded.`],
  interplay: text`It contains failures from ${link(id.migration, "Meadow Home Migration")} and preserves the durable ${link(id.meadowHome, "Meadow Home")}.`,
});

export const appPlace = define({
  id: id.appPlace, name: "App Place", aliases: ["Deep Link", "Place"], kind: "interface", searchFacet: true,
  definition: text`A screen a person can be sent to: a page, at most one surface with its step or tab, and zero or more selected pages, the first of them focused.`,
  mechanics: [
    text`Each app area declares the surfaces it owns as pure data under contracts/places; composite surfaces belong to their shared owner, and one gathering module turns them into the path grammar used by the web client, CLI, Runtime, Dev Tools, and acceptance tooling. Selected pages are named by durable bundle node ID when they have one and by source locator otherwise.`,
    text`Places are inbound first. Any place can be opened by link, and the application always publishes the place it is at. Only history places, the bundle list, the bundle editor, and Preview, change the URL and browser history when entered in the app. A link to any other place keeps its URL until the person moves on.`,
    text`Arrival opens as deep as it can. The owning area decides whether its surface can open; when the app stops short, a callout names what was reached and why, and the reached place is reported to the Runtime so the sender can see it.`,
    text`Dialogs that should never be linked are declared transient with a reason. An acceptance checkpoint fails when an open dialog is neither the current place's surface nor a declared transient.`,
  ],
  interplay: text`A ${link(id.checkpoint, "Checkpoint")} records the place its scenario was at, so a forked ${link(id.savedState, "Saved State")} opens there.`,
  implementationRoles: ["define-grammar", "publish-and-arrive"] as const,
});

export const softwareUpdate = define({
  id: id.softwareUpdate, name: "Verified Software Update", aliases: ["Software Update"], kind: "process", searchFacet: true,
  definition: text`The desktop update flow for verifying and applying a replacement application build.`,
  mechanics: [text`Downloads are verified before replacement; failures remain safe and retryable.`],
  interplay: text`An update may introduce a new ${link(id.runtimePayload, "Runtime Payload")}, whose compatibility is resolved by ${link(id.compatibilityNegotiation, "Compatibility Negotiation")}.`,
});

export const applicationConcepts = [appPlace, migration, startupRecovery, softwareUpdate] as const;
