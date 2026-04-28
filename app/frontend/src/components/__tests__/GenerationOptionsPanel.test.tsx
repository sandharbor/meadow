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

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import GenerationOptionsPanel from '../GenerationOptionsPanel';

describe('GenerationOptionsPanel', () => {
  const buildProps = () => ({
    globalOptions: {
      breadcrumbsEnabled: true,
      backlinksEnabled: true,
      tagsEnabled: true,
      hoverPreviewEnabled: false,
      markdownZipEnabled: false,
      spacedRepetitionEnabled: false,
    },
    siteOptions: {
      breadcrumbsSetting: 'inherit' as const,
      backlinksSetting: 'inherit' as const,
      tagsSetting: 'inherit' as const,
      hoverPreviewSetting: 'inherit' as const,
      markdownZipSetting: 'inherit' as const,
      spacedRepetitionSetting: 'inherit' as const,
    },
    globalSrsTags: [],
    siteSrsTagsOverride: null,
    onGlobalOptionChange: vi.fn().mockResolvedValue(undefined),
    onSiteOptionChange: vi.fn().mockResolvedValue(undefined),
    onGlobalSrsTagsChange: vi.fn().mockResolvedValue(undefined),
    onSiteSrsTagsChange: vi.fn().mockResolvedValue(undefined),
    onGlobalSrsEnable: vi.fn().mockResolvedValue(undefined),
    onSiteSrsEnable: vi.fn().mockResolvedValue(undefined),
    disabled: false,
  });

  it('shows a confirmation modal before enabling site SRS and saves the chosen tags', async () => {
    const props = buildProps();
    render(<GenerationOptionsPanel {...props} />);

    // The text is inside a flex div, which is inside the grid row div
    const spacedRepetitionRow = screen.getByText('Spaced Repetition').closest('div')!.parentElement!;
    const comboboxes = within(spacedRepetitionRow).getAllByRole('combobox');
    // Click the site column combobox to open the dropdown, then click "On" (enabled)
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
      expect(props.onSiteSrsEnable).toHaveBeenCalledWith('enabled', ['#flashcards', '#srs']);
    });
    expect(props.onGlobalSrsEnable).not.toHaveBeenCalled();
  });

  it('saves edited site SRS tags from the customize tab', async () => {
    const props = buildProps();
    render(
      <GenerationOptionsPanel
        {...props}
        globalOptions={{ ...props.globalOptions, spacedRepetitionEnabled: true }}
        siteOptions={{ ...props.siteOptions, spacedRepetitionSetting: 'enabled' }}
        siteSrsTagsOverride={['#flashcards']}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Site SRS tags'), {
      target: { value: '#flashcards\n#srs' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Tags' }));

    await waitFor(() => {
      expect(props.onSiteSrsTagsChange).toHaveBeenCalledWith(['#flashcards', '#srs']);
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

    // With only global SRS enabled (no site override), Edit opens in global scope
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Global SRS tags'), {
      target: { value: '#flashcards\n#srs' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Tags' }));

    await waitFor(() => {
      expect(props.onGlobalSrsTagsChange).toHaveBeenCalledWith(['#flashcards', '#srs']);
    });
  });

  it('can clear the site override and inherit global SRS tags', async () => {
    const props = buildProps();
    render(
      <GenerationOptionsPanel
        {...props}
        globalOptions={{ ...props.globalOptions, spacedRepetitionEnabled: true }}
        siteOptions={{ ...props.siteOptions, spacedRepetitionSetting: 'enabled' }}
        globalSrsTags={['#flashcards']}
        siteSrsTagsOverride={['#site-only']}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use Global Tags' }));

    await waitFor(() => {
      expect(props.onSiteSrsTagsChange).toHaveBeenCalledWith(null);
    });
  });

  it('does not show an edit button when SRS is disabled globally and not overridden', () => {
    const props = buildProps();
    render(<GenerationOptionsPanel {...props} />);

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('shows an edit button when site SRS is explicitly enabled without a tag override', () => {
    const props = buildProps();
    render(
      <GenerationOptionsPanel
        {...props}
        globalOptions={{ ...props.globalOptions, spacedRepetitionEnabled: true }}
        siteOptions={{ ...props.siteOptions, spacedRepetitionSetting: 'enabled' }}
        globalSrsTags={['#flashcards']}
        siteSrsTagsOverride={null}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Site SRS tags')).toHaveValue('#flashcards');
  });
});
