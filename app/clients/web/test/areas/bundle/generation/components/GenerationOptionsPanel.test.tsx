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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import GenerationOptionsPanel from '../../../../../src/areas/bundle/generation/components/GenerationOptionsPanel';

describe('GenerationOptionsPanel', () => {
  const buildProps = () => ({
    globalOptions: {
      breadcrumbsEnabled: true,
      backlinksEnabled: true,
      tagsEnabled: true,
      searchEnabled: true,
      hoverPreviewEnabled: false,
      folderNavigationEnabled: false,
      sourcesExportEnabled: false,
      openKnowledgeFormatEnabled: false,
      spacedRepetitionEnabled: false,
    },
    bundleOptions: {
      breadcrumbsSetting: 'inherit' as const,
      backlinksSetting: 'inherit' as const,
      tagsSetting: 'inherit' as const,
      searchSetting: 'inherit' as const,
      hoverPreviewSetting: 'inherit' as const,
      folderNavigationSetting: 'inherit' as const,
      sourcesExportSetting: 'inherit' as const,
      openKnowledgeFormatSetting: 'inherit' as const,
      spacedRepetitionSetting: 'inherit' as const,
    },
    globalSrsTags: [],
    bundleSrsTagsOverride: null,
    bundleSlug: 'test-bundle',
    onGlobalOptionChange: vi.fn().mockResolvedValue(undefined),
    onBundleOptionChange: vi.fn().mockResolvedValue(undefined),
    onGlobalSrsTagsChange: vi.fn().mockResolvedValue(undefined),
    onBundleSrsTagsChange: vi.fn().mockResolvedValue(undefined),
    onGlobalSrsEnable: vi.fn().mockResolvedValue(undefined),
    onBundleSrsEnable: vi.fn().mockResolvedValue(undefined),
    onBundleOkfLogSettingsChange: vi.fn().mockResolvedValue(undefined),
    onBundleOkfEnable: vi.fn().mockResolvedValue(undefined),
    disabled: false,
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        index: {
          mode: 'generated',
          sourceGraphPath: null,
          defaultPage: null,
          selectedPage: null,
        },
        log: {
          mode: 'auto',
          sourceGraphPath: null,
          defaultPage: {
            title: 'log',
            directory: '',
            file_type: 'md',
            fullPath: 'log.md',
            modifiedTimeMs: 0,
          },
          selectedPage: {
            title: 'log',
            directory: '',
            file_type: 'md',
            fullPath: 'log.md',
            modifiedTimeMs: 0,
          },
        },
        pages: [],
        count: 0,
      }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a confirmation modal before enabling bundle SRS and saves the chosen tags', async () => {
    const props = buildProps();
    render(<GenerationOptionsPanel {...props} />);

    // The text is inside a flex div, which is inside the grid row div
    const spacedRepetitionRow = screen.getByText('Spaced Repetition').closest('div')!.parentElement!;
    const comboboxes = within(spacedRepetitionRow).getAllByRole('combobox');
    // Click the bundle column combobox to open the dropdown, then click "On" (enabled)
    fireEvent.click(comboboxes[1]);
    const dropdownButtons = screen.getAllByRole('button', { name: 'On' });
    // Click the last "On" button (the one in the dropdown)
    fireEvent.click(dropdownButtons[dropdownButtons.length - 1]);

    expect(screen.getByText('Enable Spaced Repetition')).toBeInTheDocument();
    expect(screen.getByText(/will modify matching source pages/i)).toBeInTheDocument();
    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();

    const modalTextarea = screen.getByLabelText('Tags that mark pages containing SRS prompts');
    fireEvent.change(modalTextarea, { target: { value: '#flashcards\n#srs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enable SRS' }));

    await waitFor(() => {
      expect(props.onBundleSrsEnable).toHaveBeenCalledWith('enabled', ['#flashcards', '#srs']);
    });
    expect(props.onGlobalSrsEnable).not.toHaveBeenCalled();
  });

  it('saves edited bundle SRS tags from the customize tab', async () => {
    const props = buildProps();
    render(
      <GenerationOptionsPanel
        {...props}
        globalOptions={{ ...props.globalOptions, spacedRepetitionEnabled: true }}
        bundleOptions={{ ...props.bundleOptions, spacedRepetitionSetting: 'enabled' }}
        bundleSrsTagsOverride={['#flashcards']}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Bundle SRS tags'), {
      target: { value: '#flashcards\n#srs' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Tags' }));

    await waitFor(() => {
      expect(props.onBundleSrsTagsChange).toHaveBeenCalledWith(['#flashcards', '#srs']);
    });
  });

  it('saves edited global SRS tags when only global SRS is enabled', async () => {
    const props = buildProps();
    render(
      <GenerationOptionsPanel
        {...props}
        globalOptions={{ ...props.globalOptions, spacedRepetitionEnabled: true }}
        globalSrsTags={['#flashcards']}
      />
    );

    // With only global SRS enabled (no bundle override), Edit opens in global scope
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Global SRS tags'), {
      target: { value: '#flashcards\n#srs' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Tags' }));

    await waitFor(() => {
      expect(props.onGlobalSrsTagsChange).toHaveBeenCalledWith(['#flashcards', '#srs']);
    });
  });

  it('can clear the bundle override and inherit global SRS tags', async () => {
    const props = buildProps();
    render(
      <GenerationOptionsPanel
        {...props}
        globalOptions={{ ...props.globalOptions, spacedRepetitionEnabled: true }}
        bundleOptions={{ ...props.bundleOptions, spacedRepetitionSetting: 'enabled' }}
        globalSrsTags={['#flashcards']}
        bundleSrsTagsOverride={['#bundle-only']}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use Global Tags' }));

    await waitFor(() => {
      expect(props.onBundleSrsTagsChange).toHaveBeenCalledWith(null);
    });
  });

  it('does not show an edit button when SRS is disabled globally and not overridden', () => {
    const props = buildProps();
    render(<GenerationOptionsPanel {...props} />);

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('renders the OKF generation option', () => {
    const props = buildProps();
    render(<GenerationOptionsPanel {...props} />);

    expect(screen.getByText('Open Knowledge Format (OKF)')).toBeInTheDocument();
    expect(screen.getByText('Bundle only')).toBeInTheDocument();
  });

  it('renders search as enabled by default with a bundle override control', () => {
    const props = buildProps();
    render(<GenerationOptionsPanel {...props} />);

    const searchRow = screen.getByText('Search').closest('div')!.parentElement!;
    const comboboxes = within(searchRow).getAllByRole('combobox');
    expect(comboboxes).toHaveLength(2);
    expect(comboboxes[0]).toHaveTextContent('On');
    expect(comboboxes[1]).toHaveTextContent('—');
  });

  it('renders folder navigation as disabled by default with a bundle override control', () => {
    const props = buildProps();
    render(<GenerationOptionsPanel {...props} />);

    const folderNavigationRow = screen.getByText('Folder Navigation').closest('div')!.parentElement!;
    const comboboxes = within(folderNavigationRow).getAllByRole('combobox');
    expect(comboboxes).toHaveLength(2);
    expect(comboboxes[0]).toHaveTextContent('Off');
    expect(comboboxes[1]).toHaveTextContent('—');
  });

  it('shows the OKF reserved rename indicator beside the OKF generation option', () => {
    const props = buildProps();
    const onOpenKnowledgeFormatRenameDetails = vi.fn();
    render(
      <GenerationOptionsPanel
        {...props}
        bundleOptions={{ ...props.bundleOptions, openKnowledgeFormatSetting: 'enabled' }}
        openKnowledgeFormatRenameCount={2}
        onOpenKnowledgeFormatRenameDetails={onOpenKnowledgeFormatRenameDetails}
      />
    );

    const okfRow = screen.getByText('Open Knowledge Format (OKF)').closest('div')!.parentElement!;
    const indicator = within(okfRow).getByRole('button', { name: '2 renamed' });
    fireEvent.click(indicator);

    expect(onOpenKnowledgeFormatRenameDetails).toHaveBeenCalledOnce();
  });

  it('shows settings before enabling bundle OKF and saves the selected log mode', async () => {
    const props = buildProps();
    render(<GenerationOptionsPanel {...props} />);

    const okfRow = screen.getByText('Open Knowledge Format (OKF)').closest('div')!.parentElement!;
    const comboboxes = within(okfRow).getAllByRole('combobox');
    expect(comboboxes).toHaveLength(1);
    fireEvent.click(comboboxes[0]);
    const dropdownButtons = screen.getAllByRole('button', { name: 'On' });
    fireEvent.click(dropdownButtons[dropdownButtons.length - 1]);

    await screen.findByText('Open Knowledge Format Settings');
    expect(screen.getByText(/Uses log \(root\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enable OKF' }));

    await waitFor(() => {
      expect(props.onBundleOkfEnable).toHaveBeenCalledWith('enabled', {
        index: {
          mode: 'generated',
          sourceGraphPath: null,
        },
        log: {
          mode: 'auto',
          sourceGraphPath: null,
        },
      });
    });
  });

  it('shows an edit button when bundle SRS is explicitly enabled without a tag override', () => {
    const props = buildProps();
    render(
      <GenerationOptionsPanel
        {...props}
        globalOptions={{ ...props.globalOptions, spacedRepetitionEnabled: true }}
        bundleOptions={{ ...props.bundleOptions, spacedRepetitionSetting: 'enabled' }}
        globalSrsTags={['#flashcards']}
        bundleSrsTagsOverride={null}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Bundle SRS tags')).toHaveValue('#flashcards');
  });
});
