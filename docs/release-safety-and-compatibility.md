# Release safety and compatibility

This document defines Meadow's local data-safety contract beginning with Home
format 1 and application version 0.5.41. Code that reads or writes a Meadow
Home must preserve these guarantees.

## Meadow Home format

`meadow_home.yaml` is the root compatibility authority. It records the format
version, minimum reader and writer application versions, the creating and most
recent writer versions, and required capabilities. Startup validates this
manifest before Git initialization, defaults, migrations, or any other Home
mutation.

A new empty Home receives the manifest before other persisted state. A valid
legacy Home is checkpointed and upgraded. Invalid manifests, unsupported
capabilities, future formats, and applications below the minimum writer version
stop before writing. Production startup also refuses to write when the running
application version is missing or unknown.

## Durable documents

Mutable YAML, JSON, and text authorities distinguish missing, valid, and
invalid input. Invalid input is never treated as an empty/default document and
is preserved byte-for-byte. A write validates the current and next values,
takes an adjacent exclusive lock, writes a unique same-directory temporary
file, applies the intended mode, flushes it, renames it atomically, and flushes
the directory. Handled failures leave the previous target unchanged and clean
up temporary material.

Extensible document codecs preserve unknown fields. Strict codecs reject an
unknown or malformed field with its document path. Base resources and local
overlays remain separate; initialization must never fold a local override into
the tracked base document. Private documents and their temporary replacements
use mode `0600`.

Source Markdown frontmatter uses the same fail-closed atomic text path and
preserves the source file's existing mode. Generated trees and exports use
their owning staged directory transaction because they are multi-file outputs,
not single-document authorities.

## Migration authoring

Each migration exports a stable logical ID independent of its TypeScript or
packaged JavaScript filename. Core and provider scopes have separate validated
ledgers. Checked-in retired IDs preserve compatibility with historical ledgers;
unknown, inconsistent, or ambiguous entries block startup.

Before any migration can mutate a Home, the runner requires a pre-migration Git
commit of the Home, even when ordinary automatic Git management is disabled.
After the batch it requires a second commit containing the migrated state. A
small, Git-ignored recovery directory inside the Home records the durable
prepared, running, data-applied, and ledger-applied boundaries. It may also
contain byte copies of only the ignored private paths that pending migrations
explicitly declare; the runner never copies or hashes the whole Home.

After the pre-migration commit, the runner records the identity and digest of
Git's control plane outside the object database, including HEAD, refs, index,
configuration, hooks, and reflogs. It verifies that guard after every migration
and immediately before the post-migration commit. Replacement, redirection, or
mutation of protected `.git` metadata blocks recovery as ambiguous. This is a
fail-closed tripwire against accidental Git damage; migrations still run in the
application process, so it is not an operating-system security sandbox.

An interruption may only resume when the journal makes the next action
unambiguous. Otherwise startup stops rather than blindly rerunning and reports
the pre-migration Git commit plus the in-Home recovery location.

Migration authors must:

1. validate preconditions and all resulting documents;
2. use durable writes for individual authorities;
3. avoid network operations and irreversible external effects;
4. never read or write `.git` internals;
5. make the migration byte-idempotent;
6. add the logical ID to release fixtures and historical compatibility data as
   appropriate; and
7. declare every ignored private path the migration may modify; and
8. test success, a second run, invalid input, and relevant interruption points.

## Recovery and diagnostics

Bootstrap and startup failures are rendered by an Electron-owned recovery
window that does not depend on the backend being healthy. It shows the selected
Home path, application and format versions, failure category, last successful
migration, checkpoint information, and safe actions. A user can retry, choose
another Home, reveal the affected or recovery path, or export a diagnostic.

Diagnostics use an allowlist and mode `0600`. They omit document contents,
credentials, local API capabilities, parser source, environment values, and
arbitrary logs. Recovery state travels with the Home; restoring tracked state
uses the reported Git commit, while declared ignored-file copies are retained
for deliberate manual recovery.

## Credentials

For the first public release, backend-owned credential documents are plaintext
with mode `0600`; they are not encryption at rest. This protects against other
ordinary local accounts, but not malware running as the same user, privileged
access, or unencrypted backups. A future OS-backed credential design is
required to improve that boundary.

Saved values are write-only from renderer-accessible APIs. The UI may report
presence and accept replacement or clearing, but it never receives the stored
value. Any migration that touches credentials must be Git-checkpointed and
idempotent, declare the ignored credential paths it may modify, keep unrelated
secret fields, and refuse conflicting sources. Config exploration,
logs, diagnostics, snapshots, screenshots, URLs, and Git must not contain
credentials.

## Local control plane

Production selects ephemeral ports and binds the backend to `127.0.0.1`. Except
for the minimal readiness endpoint, every API route is behind centralized
per-launch capability authentication and exact-origin checks. Capabilities are
generated with at least 256 bits of randomness and are not persisted, logged,
placed in URLs, or stored by the renderer. The context-isolated preload exposes
only the narrowly shaped connection and desktop operations the UI needs;
renderer Node integration is disabled and web security is enabled.

## Application updates

An update is accepted only from signed metadata and a matching size and
SHA-256 digest. The staged disk image and application must pass integrity,
signature, Team ID, bundle ID, version, notarization, and path checks before the
installed application is touched. The updater copies to staging, atomically
swaps while retaining the prior application as rollback, launches the candidate
with a one-time health token, and removes rollback only after acknowledgement.
Any post-swap failure restores and launches the prior application. Command
arguments are passed without shell interpretation.

## Release fixtures and verification

Sanitized fixtures live under
`app/shared_data/home_fixtures/release-safety/`; their README defines the
immutable-fixture procedure. Each supported release fixture must start through
the production application path, validate schemas and invariants, perform no
network writes, and have a byte-, ledger-, manifest-, Git-, and status-stable
second startup. Future or malformed fixtures must be refused without writes.

Before release, run the focused persistence, migration, recovery, control-plane,
updater, and contract tests, followed by the repository quickcheck, complete
system suite, and complete end-to-end suite. Review recovery, credential,
update, and migration artifacts for legibility and secret/capability absence.
