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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VersionsTab } from '../../../../../src/areas/bundle/review/components/VersionsTab';

const versions = [
  {
    versionId: 'vAb3XyZ',
    createdAt: '2026-01-01T00:00:00.000Z',
    notes: 'First reader release',
    predecessorVersionId: null,
    readerConnectionToPredecessor: 'disconnected',
    localFilesState: 'present',
    displayState: 'frozen',
    savedGenerationId: 'tree-one',
    generatedChanges: [],
    integrityChanges: [],
  },
  {
    versionId: 'vQ7mN2p',
    createdAt: '2026-01-02T00:00:00.000Z',
    notes: 'Private note',
    predecessorVersionId: 'vAb3XyZ',
    readerConnectionToPredecessor: 'connected',
    localFilesState: 'present',
    displayState: 'unsaved',
    savedGenerationId: null,
    generatedChanges: [{ status: '??', relativePath: 'index.html' }],
    integrityChanges: [],
  },
];

describe('VersionsTab', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('V02 V06 renders manifest order, saved state, notes, and aligned working comparison', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('version-comparison')) {
        return { ok: true, json: async () => ({ changes: [{ status: 'added', relativePath: 'index.html' }] }) };
      }
      return { ok: true, json: async () => ({ versions }) };
    }));

    const onCreateNewVersion = vi.fn();
    render(<VersionsTab bundleSlug="garden" refreshKey={0} onCreateNewVersion={onCreateNewVersion} />);

    expect((await screen.findAllByText('vAb3XyZ')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Create New Version' }));
    expect(onCreateNewVersion).toHaveBeenCalledOnce();
    expect(screen.getAllByText('vQ7mN2p').length).toBeGreaterThan(0);
    expect(screen.getByText('Frozen')).toBeInTheDocument();
    expect(screen.getByText('Unsaved')).toBeInTheDocument();
    expect(screen.getByText('Private note')).toBeInTheDocument();
    expect(await screen.findByText('added')).toBeInTheDocument();
    expect(screen.getByText('index.html')).toBeInTheDocument();
  });

  it('V08 asks for confirmation and cancels only the never-saved current card', async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: { method?: string }) => {
      const url = String(input);
      if (url.endsWith('/current/cancel') && init?.method === 'POST') {
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (url.includes('version-comparison')) {
        return { ok: true, json: async () => ({ changes: [] }) };
      }
      return { ok: true, json: async () => ({ versions }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn(() => true));

    render(<VersionsTab bundleSlug="garden" refreshKey={0} onCreateNewVersion={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel New Version' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/review/versions/current/cancel'),
        { method: 'POST' },
      );
    });
    expect(screen.queryByRole('button', { name: 'Delete Local Files' })).toBeInTheDocument();
  });

  it('G05 presents frozen integrity details and the Git restoration action', async () => {
    const integrityVersions = versions.map(version => version.versionId === 'vAb3XyZ'
      ? {
          ...version,
          displayState: 'integrity-problem',
          integrityChanges: [{ status: 'M', relativePath: 'index.html' }],
        }
      : version);
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => String(input).includes('version-comparison')
      ? { ok: true, json: async () => ({ changes: [] }) }
      : { ok: true, json: async () => ({ versions: integrityVersions }) }));

    render(<VersionsTab bundleSlug="garden" refreshKey={0} onCreateNewVersion={vi.fn()} />);

    expect(await screen.findByText('Frozen version modified locally')).toBeInTheDocument();
    expect(screen.getByText('M index.html')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore Frozen Version from Git' })).toBeInTheDocument();
  });
});
