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

export const manualOverride = define({
  id: id.manualOverride, name: "Manual Override", kind: "process",
  definition: text`A person deliberately replacing a choice that Meadow suggested or preselected with their own explicit choice.`,
  mechanics: [
    text`An override has a system-made choice to replace. Making an individual choice where Meadow has no suggestion is a manual decision, but does not itself override a system choice.`,
    text`The owning workflow determines when the replacement is saved or accepted. Replacing a suggestion during review does not by itself apply the reviewed changes.`,
  ],
  interplay: text`${link(id.manuallyOverrideSourceIdentityMatching, "Manually Override Source Identity Matching")} applies this general action to Meadow's suggested correspondence between source files.`,
});

export const migration = define({
  id: id.migration, name: "Meadow Home Migration", aliases: ["Migration"], kind: "process", searchFacet: true,
  definition: text`A versioned transformation that advances durable Meadow Home data to the format required by the running application.`,
  mechanics: [
    text`Startup recognizes pending migrations, rewrites their target data, and records successful completion before ordinary use continues. Each migration has a stable logical ID independent of its TypeScript or packaged JavaScript filename. Core and provider scopes have separate validated ledgers; checked-in retired IDs preserve historical compatibility. Unknown, inconsistent, or ambiguous ledger entries block startup.`,
    text`Before any migration mutates a Home, the runner requires a pre-migration Git commit even when ordinary automatic Git management is disabled. After the batch it requires another commit containing the migrated state. A Git-ignored recovery directory inside the Home records durable prepared, running, data-applied, and ledger-applied boundaries. It may retain byte copies only of ignored private paths explicitly declared by pending migrations; it never copies or hashes the whole Home.`,
    text`After the pre-migration commit, the runner records the identity and digest of Git's control plane outside the object database, including HEAD, refs, index, configuration, hooks, and reflogs. It verifies that guard after every migration and immediately before the post-migration commit. Replacement, redirection, or mutation of protected Git metadata blocks recovery as ambiguous. This is a tripwire against accidental Git damage, not an operating-system sandbox around migration code.`,
    text`An interruption resumes only when the journal makes the next action unambiguous. Otherwise startup stops and reports the pre-migration commit and the recovery location rather than blindly rerunning the migration. Recovery state travels with the Home.`,
    text`Migration authors validate preconditions and resulting documents, use durable writes for individual authorities, avoid network operations and irreversible external effects, never read or write Git internals, and make each migration byte-idempotent. Authors declare every ignored private path the migration may modify and add logical IDs to release fixtures and historical compatibility data as appropriate. Tests cover success, a second run, invalid input, and relevant interruption points.`,
    text`Sanitized compatibility fixtures under shared_data/home_fixtures/release-safety follow their immutable-fixture procedure. Each supported release fixture must start through the production application path, validate schemas and invariants, perform no network writes, and have a byte-, ledger-, manifest-, Git-, and status-stable second startup. Future or malformed fixtures must be refused without writes. Release verification runs focused persistence, migration, recovery, control-plane, updater, and contract tests, then quickcheck, the complete system suite, and the complete end-to-end suite. Recovery, credential, update, and migration artifacts are reviewed for legibility and absence of secrets or capabilities.`,
  ],
  interplay: text`${link(id.startupRecovery, "Safe Startup Recovery")} owns the user-visible failure boundary when a migration cannot complete safely.`,
});

export const startupRecovery = define({
  id: id.startupRecovery, name: "Safe Startup Recovery", kind: "process", searchFacet: true,
  definition: text`The startup boundary that presents recoverable failures before the ordinary application is allowed to run.`,
  mechanics: [
    text`It handles invalid bootstrap data, incompatible durable formats, and interrupted migrations without pretending startup succeeded. The desktop recovery window is owned by Electron and does not depend on a healthy backend.`,
    text`The window shows the selected Home path, application and format versions, failure category, last successful migration, checkpoint information, and safe actions. A person can retry, choose another Home, reveal the affected or recovery path, or export a diagnostic.`,
    text`Diagnostics use an allowlist and mode 0600. They omit document contents, credentials, local API capabilities, parser source, environment values, and arbitrary logs. Restoring tracked state uses the reported Git commit; declared ignored-file copies are retained for deliberate manual recovery.`,
  ],
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
  mechanics: [
    text`An update is accepted only from signed metadata and a matching size and SHA-256 digest. The staged disk image and application must pass integrity, signature, Team ID, bundle ID, version, notarization, and path checks before the installed application is touched.`,
    text`The updater copies to staging, atomically swaps while retaining the prior application as rollback, and launches the candidate with a one-time health token. Rollback is removed only after acknowledgement. Any post-swap failure restores and launches the prior application. Command arguments are passed without shell interpretation.`,
    text`Verification failure leaves the installed application available and the update retryable; a rejected download is not offered for installation.`,
  ],
  interplay: text`An update may introduce a new ${link(id.runtimePayload, "Runtime Payload")}, whose compatibility is resolved by ${link(id.compatibilityNegotiation, "Compatibility Negotiation")}.`,
});

export const externalFileEdits = define({
  id: id.externalFileEdits, name: "Editing Files Outside Meadow", aliases: ["External File Edits"],
  kind: "process", searchFacet: true,
  definition: text`Changing files directly with an editor, script, filesystem operation, or another application, bypassing Meadow's own editing and lifecycle operations.`,
  mechanics: [
    text`Outside Meadow describes how the change is made. The affected file can still be inside the ${link(id.meadowHome, "Meadow Home")}, including a generated version's output directory.`,
    text`Source-file edits are normal inputs to ${link(id.bundleSourcing, "Sourcing")}: a source check can discover them for review and acceptance. Direct edits to retained generated output instead change files that Meadow expects to match their saved state.`,
    text`An external edit does not automatically become an accepted source snapshot or a saved generated version. The owning workflow must discover, validate, and either accept or recover the changed data.`,
  ],
  interplay: text`External edits can expose a ${link(id.dataIntegrity, "Data Integrity")} problem. A modified ${link(id.frozenVersion, "Frozen Version")} can be repaired through ${link(id.restoringFrozenVersion, "Restoring a Frozen Version")}.`,
});

export const dataIntegrity = define({
  id: id.dataIntegrity, name: "Data Integrity", kind: "capability", searchFacet: true,
  definition: text`Keeping durable files and the records describing them consistent with the accepted or saved state that Meadow claims they represent.`,
  mechanics: [
    text`Mutable YAML, JSON, and text authorities distinguish missing, valid, and invalid input. Invalid input is never treated as an empty or default document and is preserved byte-for-byte. A write validates the current and next values, takes an adjacent exclusive lock, writes a unique same-directory temporary file with the intended mode, flushes it, renames it atomically, and flushes the directory. Handled failures leave the prior target unchanged and clean up temporary material.`,
    text`Extensible codecs preserve unknown fields; strict codecs reject unknown or malformed fields with their document path. Base resources and local overlays stay separate, and initialization never folds a local override into a tracked base document. Private documents and temporary replacements use mode 0600. Source Markdown frontmatter uses the same fail-closed atomic text path and preserves the source file's existing mode. Generated trees and exports use their owning staged directory transaction because they are multi-file outputs.`,
    text`${link(id.sourceSnapshot, "Source Snapshots")} preserve accepted source material; ${link(id.generationRecord, "Generation Records")} pair generated output with its captured inputs and file identities. Integrity checks detect when the relevant files and records no longer agree with that retained state.`,
    text`For a ${link(id.frozenVersion, "Frozen Version")}, changed, added, or missing local output files produce an Integrity Problem. Versioning operations that require intact predecessors are blocked until recovery, rather than silently treating the changed bytes as a new saved generation.`,
    text`Detection and recovery belong to the affected workflow. Ordinary source editing remains a supported input workflow; restoring frozen output and recovering startup state apply to different retained data and recovery boundaries.`,
  ],
  interplay: text`${link(id.externalFileEdits, "Editing Files Outside Meadow")} can change retained data without updating its records. ${link(id.restoringFrozenVersion, "Restoring a Frozen Version")} recovers a saved output/record pair; ${link(id.startupRecovery, "Safe Startup Recovery")} handles failures at the startup boundary.`,
});

export const applicationConcepts = [appPlace, manualOverride, migration, startupRecovery, softwareUpdate, externalFileEdits, dataIntegrity] as const;
