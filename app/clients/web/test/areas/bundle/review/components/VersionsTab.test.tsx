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

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
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

function renderVersionsTab(onCreateNewVersion = vi.fn()) {
  return render(
    <MemoryRouter>
      <VersionsTab bundleSlug="garden" refreshKey={0} onCreateNewVersion={onCreateNewVersion} />
    </MemoryRouter>,
  );
}

describe('VersionsTab', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('V02 V06 renders newest first with casual names, secondary identifiers, and current emphasis', async () => {
    const savedVersions = versions.map((version, index) => index === versions.length - 1
      ? { ...version, displayState: 'current', savedGenerationId: 'tree-two' }
      : version);
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('version-comparison')) {
        return { ok: true, json: async () => ({ changes: [{ status: 'added', relativePath: 'index.html' }] }) };
      }
      return { ok: true, json: async () => ({ versions: savedVersions }) };
    }));

    const onCreateNewVersion = vi.fn();
    renderVersionsTab(onCreateNewVersion);

    const cards = await screen.findAllByTestId('version-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute('data-version-id', 'vQ7mN2p');
    expect(cards[0]).toHaveAttribute('data-version-name', 'v2');
    expect(cards[0]).toHaveAttribute('data-version-age', 'latest');
    expect(cards[1]).toHaveAttribute('data-version-id', 'vAb3XyZ');
    expect(cards[1]).toHaveAttribute('data-version-name', 'v1');
    expect(cards[1]).toHaveAttribute('data-version-age', 'older');
    expect(within(cards[0]).getByText('v2')).toBeInTheDocument();
    expect(within(cards[1]).getByText('v1')).toBeInTheDocument();
    expect(within(cards[1]).getByText('vAb3XyZ')).toHaveClass('text-neutral-400');
    expect(within(cards[0]).getByText('Current')).toHaveClass('bg-blue-100', 'text-blue-700');
    expect(cards[1]).toHaveClass('bg-neutral-50');
    fireEvent.click(screen.getByRole('button', { name: 'Create New Version' }));
    expect(onCreateNewVersion).toHaveBeenCalledOnce();
    expect(screen.getByText('Frozen')).toBeInTheDocument();
    expect(screen.getByText('Private note')).toBeInTheDocument();
    expect(await screen.findByText('added')).toBeInTheDocument();
    expect(screen.getByText('index.html')).toBeInTheDocument();
  });

  it('uses the single-version state to explain versioning without exposing the automatic version', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ versions: [{ ...versions[0], displayState: 'current' }] }),
    })));
    const onCreateNewVersion = vi.fn();

    renderVersionsTab(onCreateNewVersion);

    expect(await screen.findByRole('heading', { name: 'Why create a new version?' })).toBeInTheDocument();
    expect(screen.getByText(/big changes/).tagName).toBe('EM');
    expect(screen.getByText(/renamed several pages/)).toBeInTheDocument();
    expect(screen.getByText(/freezes the existing generated files/)).toBeInTheDocument();
    expect(screen.getByText(/Publishing destinations decide separately/)).toBeInTheDocument();
    expect(screen.queryByText('vAb3XyZ')).not.toBeInTheDocument();
    expect(screen.queryByTestId('version-card')).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('version-comparison'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Create New Version' }));
    expect(onCreateNewVersion).toHaveBeenCalledOnce();
  });

  it('disables creating another version while the current version has never been saved', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => String(input).includes('version-comparison')
      ? { ok: true, json: async () => ({ changes: [] }) }
      : { ok: true, json: async () => ({ versions }) }));
    const onCreateNewVersion = vi.fn();

    renderVersionsTab(onCreateNewVersion);

    expect(await screen.findByRole('button', { name: 'Create New Version' })).toBeDisabled();
    expect(screen.getByText('Save or cancel the unsaved version before creating another.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create New Version' }));
    expect(onCreateNewVersion).not.toHaveBeenCalled();
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

    renderVersionsTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel New Version' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/review/versions/current/cancel'),
        expect.objectContaining({ method: 'POST' }),
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

    renderVersionsTab();

    expect(await screen.findByText('Frozen version modified locally')).toBeInTheDocument();
    expect(screen.getByText('M index.html')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore Frozen Version from Git' })).toBeInTheDocument();
  });
});
