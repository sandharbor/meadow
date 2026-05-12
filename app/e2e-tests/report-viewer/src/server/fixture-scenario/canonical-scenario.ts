/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

import { CanonicalScenarioBuilder } from "./CanonicalScenarioBuilder.js";

// The canonical fixture scenario: a deterministic 5-second story that
// exercises every report-viewer surface (logs at all levels, MeadowHome
// adds/edits/commits, S3 puts, State records, multiple snapshots,
// keyframes).
//
// Authoring rule: every observable item is stamped with the tick it
// belongs to. Scrubbing to T<n> in the viewer should reveal log lines
// prefixed `T<n>:`, files named `T<n>-...`, line annotations
// `// appended at T<n>`, commits `C<n>: ...`, and snapshot labels
// `S<n>: ...` — all coherent at a glance.
//
// Reading the structure: each `b.advance(N); // begin T_n` line moves
// the clock forward by N ms and *opens* tick T_n. Every operation
// between that line and the next `advance` happens during T_n, and
// T_n's row in ticks.jsonl reflects the state at the end of T_n.

export function buildCanonicalScenario(b: CanonicalScenarioBuilder): void {
  // ── Phase 1: initial load ───────────────────────────────────────────

  b.advance(0); // begin T0
  b.frontendLog("info", "App boot");
  b.backendLog("INFO", "Backend ready, listening for requests");

  b.advance(150); // begin T1
  b.frontendLog("log", "Routing to / (sites list)");

  b.advance(200); // begin T2
  b.addMeadowFile("bookmarks.json", '{ "items": [] }\n');
  // Tracked .gitignore: anything under notes/private/ is gitignored from
  // this tick on. The ignored file is written at T7 and edited at T22 so
  // the viewer's Files tab has a clear arc to exercise: it should appear
  // greyed-out at T7 (visible-but-ignored) and the diff at T22 should be
  // readable on click, even though the file never enters git history.
  b.setMeadowGitignore("notes/private/\n");

  b.advance(150); // begin T3
  b.frontendLog("info", "Bookmarks file detected, loading");

  b.advance(150); // begin T4
  b.commitMeadowHome("initial bookmarks");

  b.advance(150); // begin T5
  const aliceRecord = b.setStateRecord(
    "users",
    "alice",
    "id: alice\nemail: alice@example\nrole: editor\n"
  );

  b.advance(150); // begin T6
  b.addKeyFrame("sites-list", "keyframe-sites-list.png");
  b.snapshot("sites list rendered with one bookmark");

  // ── Phase 2: user creates and publishes a site ──────────────────────

  b.advance(300); // begin T7
  b.frontendLog("info", "User clicked New Site");
  // Ignored working-tree file: matches the .gitignore from T2, so it
  // exists on disk but git never tracks it. The viewer should still
  // surface it (greyed-out) and the click-to-view content should work.
  b.addIgnoredMeadowFile(
    "notes/private/scratchpad.md",
    "# scratchpad\nfirst draft of release notes\n"
  );

  b.advance(200); // begin T8 — append a line to the existing bookmarks file
  b.appendMeadowLine(
    "T2-bookmarks.json",
    '  { "title": "My new site", "url": "/sites/my-new-site" }'
  );

  b.advance(150); // begin T9
  b.addMeadowFile("site_config.yaml", "title: My new site\ntheme: default\n");
  const settingsFile = b.addMeadowFile("site/settings.json", '{ "theme": "default" }\n');

  b.advance(150); // begin T10
  b.frontendLog("warning", "Slow network detected, deferring asset preload");
  const aboutFile = b.addMeadowFile("site/pages/about.md", "# About\nDraft about page.\n");
  const draftFile = b.addMeadowFile("site/pages/draft.md", "# Draft\nTemporary content.\n");
  const todoFile = b.addMeadowFile("notes/todo.md", "- publish site\n");
  const checklistFile = b.addMeadowFile("notes/release_checklist.md", "- verify homepage\n");

  b.advance(200); // begin T11
  b.commitMeadowHome("created site, updated bookmarks");

  b.advance(200); // begin T12
  const indexObjectKey = b.putObject(
    "sites/my-new-site/index.html",
    "<!doctype html><title>My new site</title>\n"
  );

  b.advance(100); // begin T13
  const stylesObjectKey = b.putObject(
    "sites/my-new-site/styles.css",
    "/* T13 styles */\nbody { font-family: sans-serif; }\n"
  );
  // Edit the gitignored scratchpad in a tick that is otherwise quiet for
  // MeadowHome — gives the Files tab a clean "ignored + modified" beat to
  // demonstrate the lighter-amber treatment.
  b.appendMeadowLine(
    "notes/private/scratchpad.md",
    "ship copy locked in"
  );

  b.advance(150); // begin T14
  b.setStateRecord("pages", "my-new-site-home", "title: home\nstatus: published\n");

  b.advance(100); // begin T15
  b.addKeyFrame("publish-complete", "keyframe-publish-complete.png");
  b.snapshot("site published");

  b.advance(100); // begin T16
  // No operations: this quiet tick lets the State/S3 commits created by
  // the publish snapshot become visible in tick-captured state.

  b.advance(100); // begin T17
  b.snapshot("snapshot with nothing changed");

  b.advance(150); // begin T18
  b.updateObject(
    indexObjectKey,
    "<!doctype html><title>My new site</title><main>Updated at T18</main>\n"
  );
  b.appendMeadowLine(settingsFile, '"accent": "blue"');
  b.updateStateRecord(
    aliceRecord,
    "id: alice\nemail: alice@example\nrole: admin\nlastSeen: T18\n"
  );

  b.advance(150); // begin T19
  b.deleteObject(stylesObjectKey);
  b.deleteMeadowFile(draftFile);
  b.deleteStateRecord(aliceRecord);

  // ── Phase 3: user edits, network hiccup, recovery ───────────────────

  b.advance(400); // begin T20
  b.frontendLog("error", "Failed to fetch /api/user-prefs (500)");
  b.appendMeadowLine(aboutFile, "Published site is now live.");

  b.advance(150); // begin T21
  b.backendLog("WARN", "Cache miss for user prefs, falling back to defaults");
  b.deleteMeadowFile(checklistFile);

  b.advance(150); // begin T22
  b.appendMeadowLine(
    "T9-site_config.yaml",
    "subtitle: edited after publish"
  );
  b.appendMeadowLine(todoFile, "- update launch notes");

  b.advance(200); // begin T23 — uncommitted edit dangles into the next snapshot
  b.frontendLog("info", "User saved subtitle");
  b.addMeadowFile("site/pages/changelog.md", "# Changelog\n- Site created\n");

  b.advance(200); // begin T24
  b.setStateRecord(
    "events",
    "publish-completed",
    "type: publish\nsite: my-new-site\noutcome: ok\n"
  );
  b.addMeadowFile("site/pages/contact.md", "# Contact\nhello@example\n");
  // Close out the ignored-file lifecycle: scratchpad is deleted off
  // disk. The viewer should render it strikethrough + light-red italic
  // at T24, and clicking the entry should still show the T23 content
  // as the diff baseline (the previous tick's ignoredFileContents).
  b.deleteMeadowFile("notes/private/scratchpad.md");

  b.advance(150); // begin T25
  b.commitMeadowHome("subtitle edit");

  b.advance(200); // begin T26
  b.frontendLog("info", "All clear");
  b.snapshot("post-edit, all changes saved");

  // Final settle — give the timeline a tail so the scrubber doesn't snap
  // straight to the last snapshot. The fake clock should land near 5000ms.
  b.advance(150); // begin T27
}
