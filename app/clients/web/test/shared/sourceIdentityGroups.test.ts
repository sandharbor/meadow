/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { describe, expect, it } from 'vitest';
import { groupSourceIdentities } from '../../src/areas/bundle/sourcing/components/groupSourceIdentities.js';
import type { SourceIdentityRecommendation } from '../../../../shared_code/utils/sourceMoveResolutions.js';

const record = (id: string, oldPath: string, newPath: string): SourceIdentityRecommendation => ({
  id, confident: true, destination: newPath, decided: false,
  moves: [{ bundleNodeId: id, oldPath, newPath, similarity: { score: 0.9, criteria: [] }, confidence: 'strong', competing: false, evidence: [], previousRoute: [], currentRoute: [] }],
});

describe('identity change groups', () => {
  it('orders combined directory changes and renames before directory changes and renames', () => {
    const sections = groupSourceIdentities([record('rename', 'old.md', 'new.md'), record('move', 'old/page.md', 'new/page.md'), record('both', 'old/old.md', 'new/new.md')], {});
    expect(sections.map(section => section.label)).toEqual(['Changed directories and renamed', 'Changed directories', 'Renamed']);
  });

  it('groups a shared folder move across unchanged nested folders', () => {
    const sections = groupSourceIdentities([record('a', 'mwd/a.md', 'mwd/development/a.md'), record('b', 'mwd/project/b.md', 'mwd/development/project/b.md')], {});
    expect(sections).toHaveLength(1);
    expect(sections[0].groups).toMatchObject([{ beforeDirectory: 'mwd', afterDirectory: 'mwd/development', records: [{ id: 'a' }, { id: 'b' }] }]);
  });

  it('keeps different folder destinations separate', () => {
    const sections = groupSourceIdentities([record('a', 'old/a.md', 'new/a.md'), record('b', 'old/b.md', 'other/b.md')], {});
    expect(sections[0].groups).toHaveLength(2);
  });

  it('groups the same filename edit while preserving distinct edits', () => {
    const sections = groupSourceIdentities([record('a', 'old One.md', 'new One.md'), record('b', 'folder/old Two.md', 'folder/new Two.md'), record('c', 'unrelated.md', 'other.md')], {});
    expect(sections[0].groups.map(group => group.records.length)).toEqual([2, 1]);
    expect(sections[0].groups[0]).toMatchObject({ beforeName: 'old', afterName: 'new' });
  });

  it('only groups combined moves when the filename edit also matches', () => {
    const sections = groupSourceIdentities([record('a', 'old/v1 One.md', 'new/v2 One.md'), record('b', 'old/v1 Two.md', 'new/v3 Two.md')], {});
    expect(sections[0].groups).toHaveLength(2);
  });

  it('keeps competing destinations in an individual overview', () => {
    const ambiguous = record('ambiguous', 'old/a.md', 'new/a.md');
    ambiguous.moves.push({ ...ambiguous.moves[0], newPath: 'elsewhere/a.md' });
    const sections = groupSourceIdentities([ambiguous, record('single', 'old/b.md', 'new/b.md')], {});
    expect(sections[0].groups.map(group => group.records.length)).toEqual([1, 1]);
  });

  it('shows a chosen alternative rather than the strongest candidate in the overview', () => {
    const ambiguous = record('a', 'old/a.md', 'new/a.md');
    ambiguous.moves.push({ ...ambiguous.moves[0], newPath: 'old/renamed.md' });
    const sections = groupSourceIdentities([ambiguous], { a: 'old/renamed.md' });
    expect(sections[0].label).toBe('Renamed');
    expect(sections[0].groups[0]).toMatchObject({ beforeName: 'a', afterName: 'renamed' });
  });
});
