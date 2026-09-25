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

// Development concepts name the machinery around the product: the states that
// Dev Tools opens and E2E scenarios start from, and the local services they use.

export const savedState = define({
  id: id.savedState, name: "Saved State", kind: "artifact",
  definition: text`A reproducible ${link(id.meadowHome, "Meadow Home")} starting point, together with any service state it depends on, that development tooling and acceptance scenarios can open.`,
  mechanics: [
    text`Its origin is an ${link(id.emptyHome, "Empty Home")}, a ${link(id.homeFixture, "Home Fixture")}, or a ${link(id.checkpoint, "Checkpoint")}. One shared opener serves Dev Tools and E2E, so a scenario's starting state is exactly what a developer opens for manual QA.`,
    text`Every opened saved state lives in its own home folder selected by MEADOW_HOME_DIRECTORY_OVERRIDE. The developer's real Meadow Home is never moved or replaced; Dev Tools opens it separately as Normal.`,
    text`Opening only writes files. Tooling never initializes Git or commits: the application or CLI establishes the home's first commit through shared runtime startup code, exactly as on a user's first launch.`,
    text`Opening reports what is being QA-ed: origin, the checkpoint it came from, ${link(id.serviceTarget, "Service Target")}, leased ${link(id.localServices, "Local Services")} partitions, the home path, the capturing code revision against the current checkout, and any home format upgrade applied on open.`,
  ],
  interplay: text`${link(id.sourceChange, "Source Changes")} apply to any open saved state whose isolated source graph they target, including a forked ${link(id.checkpoint, "Checkpoint")}.`,
  implementationRoles: ["open-fixture", "open-for-qa"] as const,
});

export const emptyHome = define({
  id: id.emptyHome, name: "Empty Home", aliases: ["Missing config", "fresh install"], kind: "state",
  definition: text`A ${link(id.savedState, "Saved State")} whose ${link(id.meadowHome, "Meadow Home")} folder does not exist yet.`,
  mechanics: [text`It reproduces a fresh install. The application creates the folder, writes its format manifest, and records the initial Meadow Home commit.`],
  interplay: text`It is distinct from a minimal ${link(id.homeFixture, "Home Fixture")}, which already contains application configuration and a source graph.`,
});

export const homeFixture = define({
  id: id.homeFixture, name: "Home Fixture", aliases: ["Fixture", "Home Fixtures"], kind: "artifact",
  definition: text`A hand-authored ${link(id.savedState, "Saved State")} checked in under shared_data/home_fixtures, paired with the fixture source graphs it references.`,
  mechanics: [
    text`Fixtures contain only authored files. A quickcheck rejects generated or machine-local content such as bundle raw and build folders, Git metadata, local resource overrides, secrets, and logs.`,
    text`Nothing writes fixtures automatically. Adding one is a deliberate change because development QA and acceptance scenarios both depend on it.`,
  ],
  interplay: text`Opening a fixture copies its files, isolates its source graphs, and rewrites source directories to the opened home. A ${link(id.checkpoint, "Checkpoint")} captures what a scenario did after starting from one.`,
});

export const checkpoint = define({
  id: id.checkpoint, name: "Checkpoint", kind: "artifact",
  definition: text`A named phase boundary in an acceptance scenario that captures a restorable ${link(id.savedState, "Saved State")}.`,
  mechanics: [
    text`Each checkpoint commits the complete ${link(id.meadowHome, "Meadow Home")}, including its Git repository, ignored files, generated bundle data, and isolated source graphs, into the scenario's artifact state repository. Every participating service part commits its state at the same moment.`,
    text`It records the active service parts, the home format version, the application version, and the code revision. Capture refuses to run if the home is configured for anything other than ${link(id.localServices, "Local Services")}.`,
    text`Opening a checkpoint restores every part into a new home and fresh partitions: the captured data on the current code. Older home formats upgrade through normal startup; newer or unsupported formats cannot be opened.`,
  ],
  interplay: text`A checkpoint is not a ${link(id.sourceSnapshot, "Source Snapshot")}; a scenario may checkpoint a home that contains many source snapshots. Commits made by the home itself during a run are ${link(id.homeCommit, "Home Commits")}.`,
  implementationRoles: ["capture", "restore"] as const,
});

export const homeCommit = define({
  id: id.homeCommit, name: "Home Commit", aliases: ["Home Commits"], kind: "artifact",
  definition: text`A Git commit made in a ${link(id.meadowHome, "Meadow Home")} and observed during an acceptance run.`,
  mechanics: [text`Run manifests list home commits separately from ${link(id.checkpoint, "Checkpoints")}. The first one, initial Meadow Home commit, is made by runtime startup.`],
  interplay: text`Home commits are application behavior under test; ${link(id.checkpoint, "Checkpoints")} are test-authored phase boundaries.`,
});

export const localServices = define({
  id: id.localServices, name: "Local Services", kind: "service",
  definition: text`Locally run stand-ins for hosted backends, shared by acceptance scenarios and development tooling through leased partitions.`,
  mechanics: [
    text`One owner starts shared containers when needed and hands out partitions with string identities, such as an E2E worker or a Dev Tools fork. A partition names the storage bucket and table prefix; containers stop only when no partition is leased.`,
    text`Service parts are contributed by the open core (object storage and the static web server) and by mounted extensions. Each part knows how to start, clear, capture, and restore its partition.`,
  ],
  interplay: text`A ${link(id.serviceTarget, "Service Target")} of Local points an opened ${link(id.savedState, "Saved State")} at its leased partitions.`,
  implementationRoles: ["hold-containers", "serve-partition"] as const,
});

export const serviceTarget = define({
  id: id.serviceTarget, name: "Service Target", kind: "state",
  definition: text`The backend an opened ${link(id.savedState, "Saved State")} talks to: Local or Hosted Development.`,
  mechanics: [text`Local is the default action. Hosted Development is an explicit choice and is unavailable, with a reason, when the saved state already holds state in ${link(id.localServices, "Local Services")}, such as published content or a signed-in account.`],
  interplay: text`A forked ${link(id.checkpoint, "Checkpoint")} that used local services must stay Local; mixing its captured references with a hosted backend could not work.`,
});

export const developmentConcepts = [savedState, emptyHome, homeFixture, checkpoint, homeCommit, localServices, serviceTarget] as const;
