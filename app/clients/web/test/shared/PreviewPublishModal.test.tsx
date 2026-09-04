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

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PreviewPublishModal from '../../src/shared/app-shell/components/PreviewPublishModal';

const transport = vi.hoisted(() => ({
  streams: [] as Array<{ url: string; onmessage?: (event: { data: string }) => void; close: () => void }>,
  request: vi.fn(),
}));
vi.mock('../../src/shared/utils/apiClient', () => ({
  apiRequest: transport.request,
  AuthenticatedEventSource: class {
    onmessage?: (event: { data: string }) => void;
    close = vi.fn();
    constructor(public url: string) { transport.streams.push(this); }
  },
}));
vi.mock('../../src/shared/publishing-provider-host/useActivePublishingProvider', () => ({ useActivePublishingProvider: () => null }));
vi.mock('../../src/areas/bundle/review/components/VersionsTab', () => ({
  VersionsTab: ({ onVersionChanged }: { onVersionChanged: () => void }) => <button onClick={onVersionChanged}>Cancel new version</button>,
}));
vi.mock('../../src/areas/bundle/review/components/PreviewChangesTab', () => ({
  default: ({ contentRefreshKey, onSelectedFileChange }: { contentRefreshKey: number; onSelectedFileChange: (path: string) => void }) => (
    <div data-testid="changes-content" data-refresh={contentRefreshKey}>
      <button onClick={() => onSelectedFileChange('/preview/nested/Child.html')}>Select child change</button>
    </div>
  ),
}));
vi.mock('../../src/areas/bundle/generation/components/CustomizeSidebar', () => ({
  default: ({ onGlobalOptionChange }: { onGlobalOptionChange: (option: 'breadcrumbs', enabled: boolean) => Promise<void> }) => (
    <button onClick={() => { void onGlobalOptionChange('breadcrumbs', false); }}>Disable breadcrumbs</button>
  ),
}));

const props: React.ComponentProps<typeof PreviewPublishModal> = {
  slug: 'example', onClose: vi.fn(), onBusyChange: vi.fn(), onAuthError: vi.fn(),
  globalGenerationOptions: {
    breadcrumbsEnabled: true, backlinksEnabled: true, tagsEnabled: true, searchEnabled: true,
    hoverPreviewEnabled: false, folderNavigationEnabled: false, sourcesExportEnabled: false,
    openKnowledgeFormatEnabled: false, spacedRepetitionEnabled: false,
  },
  bundleGenerationOptions: {
    breadcrumbsSetting: 'inherit', backlinksSetting: 'inherit', tagsSetting: 'inherit', searchSetting: 'inherit',
    hoverPreviewSetting: 'inherit', folderNavigationSetting: 'inherit', sourcesExportSetting: 'inherit',
    openKnowledgeFormatSetting: 'inherit', spacedRepetitionSetting: 'inherit',
  },
  globalSrsTags: [], bundleSrsTagsOverride: null,
  onGlobalGenerationOptionChange: vi.fn(async () => undefined),
  onBundleGenerationOptionChange: vi.fn(async () => undefined),
  onGlobalSrsTagsChange: vi.fn(async () => undefined), onBundleSrsTagsChange: vi.fn(async () => undefined),
  onBundleOkfLogSettingsChange: vi.fn(async () => undefined), onBundleOkfEnable: vi.fn(async () => undefined),
  untrackedNodeCount: 0, onShowUntrackedNodes: vi.fn(), hooksHaveErrors: false,
};
const firstUrl = 'http://localhost/api/bundles/example/generation/published/Entry.html?_t=1';

async function emit(index: number, stage: string, url?: string) {
  await act(async () => {
    transport.streams[index].onmessage?.({ data: JSON.stringify({
      stage, message: stage, ...(url ? { result: { success: true, traversalPageUrl: url } } : {}),
    }) });
  });
}

describe('progressive bundle preview', () => {
  beforeEach(() => {
    transport.streams.length = 0;
    transport.request.mockResolvedValue({ ok: true, json: async () => ({
      versions: [], tree: [{ path: '/preview/nested/Child.html', gitStatus: 'modified' }], root: '/preview', renames: [], calloutDismissals: { customizeSidebarAutoShown: true },
    }) });
  });

  it('shows the start page before completion and retains its iframe across Versions and Changes', async () => {
    render(<PreviewPublishModal {...props} />);
    await emit(0, 'generating', firstUrl);
    const iframe = screen.getByTitle('Preview');
    expect(iframe).toHaveAttribute('src', firstUrl);
    expect(transport.streams[0].close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Versions' }));
    expect(iframe).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Changes/ }));
    expect(screen.getByTestId('changes-content')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bundle Preview' }));
    expect(screen.getByTitle('Preview')).toBe(iframe);
    await emit(0, 'complete', firstUrl);
    expect(screen.getByTitle('Preview')).toBe(iframe);
    expect(transport.streams).toHaveLength(1);
  });

  it('prioritizes the selected change and refreshes it while customization is still rendering', async () => {
    render(<PreviewPublishModal {...props} />);
    await emit(0, 'generating', firstUrl);
    await emit(0, 'complete', firstUrl);
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /^Changes/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Select child change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disable breadcrumbs' }));
    await waitFor(() => expect(transport.streams).toHaveLength(2));
    expect(new window.URL(transport.streams[1].url, 'http://localhost').searchParams.get('startPagePath')).toBe('nested/Child.html');
    const nextUrl = firstUrl.replace('Entry.html?_t=1', 'nested/Child.html?_t=2');
    await emit(1, 'generating', nextUrl);
    expect(screen.getByTestId('changes-content')).toHaveAttribute('data-refresh', '1');
    expect(screen.getByTitle('Preview')).toHaveAttribute('src', nextUrl);
    expect(transport.streams[1].close).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    await emit(1, 'complete', nextUrl);
    expect(screen.getByTitle('Preview')).toHaveAttribute('src', nextUrl);
  });

  it('discards cached Changes after a version action without discarding the preview on tab switches', async () => {
    render(<PreviewPublishModal {...props} />);
    await emit(0, 'complete', firstUrl);
    const iframe = screen.getByTitle('Preview');
    fireEvent.click(screen.getByRole('button', { name: /^Changes/ }));
    const oldChanges = screen.getByTestId('changes-content');
    fireEvent.click(screen.getByRole('button', { name: 'Versions' }));
    expect(oldChanges).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel new version' }));
    expect(oldChanges).not.toBeInTheDocument();
    expect(iframe).not.toHaveAttribute('src', firstUrl);
    expect(new window.URL(iframe.getAttribute('src')!).pathname).toBe(new window.URL(firstUrl).pathname);
    fireEvent.click(screen.getByRole('button', { name: /^Changes/ }));
    expect(screen.getByTestId('changes-content')).not.toBe(oldChanges);
    expect(screen.getByTitle('Preview')).toBe(iframe);
  });
});
