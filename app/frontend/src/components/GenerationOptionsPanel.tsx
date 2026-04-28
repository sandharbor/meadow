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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';

type OverrideSetting = 'inherit' | 'enabled' | 'disabled';

interface GenerationOptionsPanelProps {
  globalOptions: {
    breadcrumbsEnabled: boolean;
    backlinksEnabled: boolean;
    tagsEnabled: boolean;
    hoverPreviewEnabled: boolean;
    markdownZipEnabled: boolean;
    spacedRepetitionEnabled: boolean;
  };
  siteOptions: {
    breadcrumbsSetting: OverrideSetting;
    backlinksSetting: OverrideSetting;
    tagsSetting: OverrideSetting;
    hoverPreviewSetting: OverrideSetting;
    markdownZipSetting: OverrideSetting;
    spacedRepetitionSetting: OverrideSetting;
  };
  globalSrsTags: string[];
  siteSrsTagsOverride: string[] | null;
  onGlobalOptionChange: (option: 'breadcrumbs' | 'backlinks' | 'tags' | 'hoverPreview' | 'markdownZip' | 'spacedRepetition', enabled: boolean) => Promise<void>;
  onSiteOptionChange: (option: 'breadcrumbs' | 'backlinks' | 'tags' | 'hoverPreview' | 'markdownZip' | 'spacedRepetition', setting: OverrideSetting) => Promise<void>;
  onGlobalSrsTagsChange: (tags: string[]) => Promise<void>;
  onSiteSrsTagsChange: (tags: string[] | null) => Promise<void>;
  onGlobalSrsEnable: (tags: string[]) => Promise<void>;
  onSiteSrsEnable: (setting: OverrideSetting, tags: string[]) => Promise<void>;
  disabled?: boolean;
}

type PendingSrsEnable =
  | { scope: 'global' }
  | { scope: 'site'; setting: OverrideSetting };

const DEFAULT_SRS_TAG = '#flashcards';

const normalizeSrsTags = (input: string): string[] => {
  const seen = new Set<string>();
  const tags: string[] = [];

  input
    .split(/[\s,]+/)
    .map(token => token.trim())
    .filter(Boolean)
    .forEach(token => {
      const normalized = token.startsWith('#') ? token : `#${token}`;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        tags.push(normalized);
      }
    });

  return tags;
};

const tagsToInput = (tags: string[]): string => tags.join('\n');

const GLOBAL_OPTIONS = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

const SITE_OPTIONS = [
  { value: 'inherit', label: '\u2014' },
  { value: 'enabled', label: 'On' },
  { value: 'disabled', label: 'Off' },
];

const HoverSelect: React.FC<{
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  colorClass: string;
  disabled?: boolean;
}> = ({ value, options, onChange, colorClass, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const currentLabel = options.find(o => o.value === value)?.label ?? '';

  return (
    <div className="group/cell relative" ref={ref}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full cursor-pointer text-xs text-center py-0.5 outline-none bg-transparent ${colorClass} disabled:cursor-not-allowed disabled:opacity-50`}
        role="combobox"
        aria-expanded={isOpen}
      >
        {currentLabel}
      </button>
      <div className="absolute inset-y-0 right-0 flex items-center pointer-events-none opacity-0 group-hover/cell:opacity-100 transition-opacity">
        <svg className="w-2.5 h-2.5 text-neutral-400" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4l2.5 2.5 2.5-2.5" />
        </svg>
      </div>
      {isOpen && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-neutral-200 rounded shadow-lg z-20 min-w-[52px] py-0.5">
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setIsOpen(false);
              }}
              className={`w-full text-center px-3 py-1 text-xs cursor-pointer hover:bg-main-100 hover:text-main-800 ${
                o.value === value ? 'bg-main-50 text-main-700 font-medium' : 'text-neutral-700'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const GenerationOptionsPanel: React.FC<GenerationOptionsPanelProps> = ({
  globalOptions,
  siteOptions,
  globalSrsTags,
  siteSrsTagsOverride,
  onGlobalOptionChange,
  onSiteOptionChange,
  onGlobalSrsTagsChange,
  onSiteSrsTagsChange,
  onGlobalSrsEnable,
  onSiteSrsEnable,
  disabled,
}) => {
  // scope is only used by the SRS tags modal
  const [scope, setScope] = useState<'global' | 'site'>('site');
  const [isSrsConsentModalOpen, setIsSrsConsentModalOpen] = useState(false);
  const [isSrsTagsModalOpen, setIsSrsTagsModalOpen] = useState(false);
  const [pendingSrsEnable, setPendingSrsEnable] = useState<PendingSrsEnable | null>(null);
  const [modalTagInput, setModalTagInput] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [globalTagInput, setGlobalTagInput] = useState(tagsToInput(globalSrsTags));
  const [siteTagInput, setSiteTagInput] = useState(tagsToInput(siteSrsTagsOverride ?? []));
  const [tagSaveError, setTagSaveError] = useState<string | null>(null);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [isSubmittingSrsEnable, setIsSubmittingSrsEnable] = useState(false);

  useEffect(() => {
    setGlobalTagInput(tagsToInput(globalSrsTags));
  }, [globalSrsTags]);

  const effectiveBacklinksEnabled =
    siteOptions.backlinksSetting === 'inherit'
      ? globalOptions.backlinksEnabled
      : siteOptions.backlinksSetting === 'enabled';

  const effectiveSpacedRepetitionEnabled =
    siteOptions.spacedRepetitionSetting === 'inherit'
      ? globalOptions.spacedRepetitionEnabled
      : siteOptions.spacedRepetitionSetting === 'enabled';

  const effectiveSrsTags = useMemo(
    () => siteSrsTagsOverride ?? globalSrsTags,
    [siteSrsTagsOverride, globalSrsTags]
  );
  const siteTagBaseline = useMemo(
    () => siteSrsTagsOverride ?? (siteOptions.spacedRepetitionSetting === 'enabled' ? globalSrsTags : []),
    [siteSrsTagsOverride, siteOptions.spacedRepetitionSetting, globalSrsTags]
  );

  useEffect(() => {
    setSiteTagInput(tagsToInput(siteTagBaseline));
  }, [siteTagBaseline]);

  const openSrsConsentModal = (pending: PendingSrsEnable) => {
    setPendingSrsEnable(pending);
    const seededTags = pending.scope === 'global'
      ? globalSrsTags
      : (siteSrsTagsOverride ?? globalSrsTags);
    setModalTagInput(tagsToInput(seededTags.length > 0 ? seededTags : [DEFAULT_SRS_TAG]));
    setModalError(null);
    setIsSrsConsentModalOpen(true);
  };

  const openSrsTagsModal = (modalScope: 'global' | 'site') => {
    setScope(modalScope);
    setTagSaveError(null);
    if (modalScope === 'global') {
      setGlobalTagInput(tagsToInput(globalSrsTags));
    } else {
      setSiteTagInput(tagsToInput(siteTagBaseline));
    }
    setIsSrsTagsModalOpen(true);
  };

  const handleGlobalSpacedRepetitionChange = async (checked: boolean) => {
    if (!checked) {
      await onGlobalOptionChange('spacedRepetition', false);
      return;
    }

    if (!effectiveSpacedRepetitionEnabled) {
      openSrsConsentModal({ scope: 'global' });
      return;
    }

    await onGlobalOptionChange('spacedRepetition', true);
  };

  const handleSiteSpacedRepetitionChange = async (setting: OverrideSetting) => {
    const nextEffective = setting === 'inherit'
      ? globalOptions.spacedRepetitionEnabled
      : setting === 'enabled';

    if (nextEffective && !effectiveSpacedRepetitionEnabled) {
      openSrsConsentModal({ scope: 'site', setting });
      return;
    }

    await onSiteOptionChange('spacedRepetition', setting);
  };

  const handleConfirmSrsEnable = async () => {
    if (!pendingSrsEnable) return;

    const parsedTags = normalizeSrsTags(modalTagInput);
    if (parsedTags.length === 0) {
      setModalError('Add at least one tag so Meadow knows which source pages to scan for flashcards.');
      return;
    }

    setIsSubmittingSrsEnable(true);
    setModalError(null);
    try {
      if (pendingSrsEnable.scope === 'global') {
        await onGlobalSrsEnable(parsedTags);
      } else {
        await onSiteSrsEnable(pendingSrsEnable.setting, parsedTags);
      }
      setIsSrsConsentModalOpen(false);
      setPendingSrsEnable(null);
      setIsSrsTagsModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to enable spaced repetition.';
      setModalError(message);
    } finally {
      setIsSubmittingSrsEnable(false);
    }
  };

  const parsedGlobalTags = normalizeSrsTags(globalTagInput);
  const parsedSiteTags = normalizeSrsTags(siteTagInput);
  const globalTagsDirty = tagsToInput(parsedGlobalTags) !== tagsToInput(globalSrsTags);
  const siteTagsDirty = tagsToInput(parsedSiteTags) !== tagsToInput(siteTagBaseline);

  const handleSaveGlobalTags = async (): Promise<boolean> => {
    if (globalOptions.spacedRepetitionEnabled && parsedGlobalTags.length === 0) {
      setTagSaveError('Global spaced repetition requires at least one matching tag.');
      return false;
    }

    setIsSavingTags(true);
    setTagSaveError(null);
    try {
      await onGlobalSrsTagsChange(parsedGlobalTags);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save global SRS tags.';
      setTagSaveError(message);
      return false;
    } finally {
      setIsSavingTags(false);
    }
  };

  const handleSaveSiteTags = async (): Promise<boolean> => {
    if (effectiveSpacedRepetitionEnabled && parsedSiteTags.length === 0) {
      setTagSaveError('Spaced repetition requires at least one matching tag.');
      return false;
    }

    setIsSavingTags(true);
    setTagSaveError(null);
    try {
      await onSiteSrsTagsChange(parsedSiteTags);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save site SRS tags.';
      setTagSaveError(message);
      return false;
    } finally {
      setIsSavingTags(false);
    }
  };

  const handleResetTags = async () => {
    setTagSaveError(null);
    if (scope === 'global') {
      setGlobalTagInput(tagsToInput(globalSrsTags));
      return;
    }
    setSiteTagInput(tagsToInput(siteTagBaseline));
  };

  const handleUseGlobalTags = async () => {
    setIsSavingTags(true);
    setTagSaveError(null);
    try {
      await onSiteSrsTagsChange(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to clear site SRS tag override.';
      setTagSaveError(message);
    } finally {
      setIsSavingTags(false);
    }
  };

  const tagsEditorValue = scope === 'global' ? globalTagInput : siteTagInput;
  const canEditGlobalTags = globalOptions.spacedRepetitionEnabled;
  const canEditSiteTags = siteOptions.spacedRepetitionSetting === 'enabled';
  const showSrsEdit = canEditGlobalTags || canEditSiteTags;
  const srsEditScope = canEditSiteTags ? 'site' : 'global';

  const renderRow = (
    name: string,
    globalValue: boolean,
    siteSetting: OverrideSetting,
    onGlobalChange: (enabled: boolean) => void | Promise<void>,
    onSiteChange: (setting: OverrideSetting) => void | Promise<void>,
    opts?: { disabled?: boolean; dimmed?: boolean; tooltip?: string; action?: React.ReactNode },
  ) => {
    const hasOverride = siteSetting !== 'inherit';
    const globalColorClass = hasOverride
      ? 'text-neutral-300'
      : globalValue ? 'text-success-600' : 'text-neutral-500';
    const siteColorClass = siteSetting === 'inherit'
      ? 'text-neutral-300'
      : siteSetting === 'enabled' ? 'text-success-600' : 'text-neutral-500';

    return (
      <div
        className={`grid grid-cols-[1fr,60px,60px] items-center gap-2 px-3 py-2 border-b border-neutral-100 last:border-b-0 ${opts?.dimmed ? 'opacity-50' : ''}`}
        title={opts?.tooltip}
      >
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-neutral-700 truncate">{name}</span>
          {opts?.action}
        </div>
        <HoverSelect
          value={globalValue ? 'on' : 'off'}
          options={GLOBAL_OPTIONS}
          onChange={(val) => onGlobalChange(val === 'on')}
          colorClass={globalColorClass}
          disabled={opts?.disabled || disabled}
        />
        <HoverSelect
          value={siteSetting}
          options={SITE_OPTIONS}
          onChange={(val) => onSiteChange(val as OverrideSetting)}
          colorClass={siteColorClass}
          disabled={opts?.disabled || disabled}
        />
      </div>
    );
  };

  return (
    <>
      <div className="text-sm">
        <div className="font-medium text-neutral-700 mb-3">Publish Options</div>
        <div className="rounded border border-neutral-200">
          <div className="grid grid-cols-[1fr,60px,60px] items-center gap-2 px-3 py-2 bg-neutral-50 border-b border-neutral-200 text-xs font-medium text-neutral-500">
            <span>Setting</span>
            <span className="text-center">Global</span>
            <span className="text-center">Site</span>
          </div>

          {renderRow(
            'Breadcrumbs',
            globalOptions.breadcrumbsEnabled,
            siteOptions.breadcrumbsSetting,
            (enabled) => onGlobalOptionChange('breadcrumbs', enabled),
            (setting) => onSiteOptionChange('breadcrumbs', setting),
          )}
          {renderRow(
            'Backlinks',
            globalOptions.backlinksEnabled,
            siteOptions.backlinksSetting,
            (enabled) => onGlobalOptionChange('backlinks', enabled),
            (setting) => onSiteOptionChange('backlinks', setting),
          )}
          {renderRow(
            'Tags',
            globalOptions.tagsEnabled && globalOptions.backlinksEnabled,
            siteOptions.tagsSetting,
            (enabled) => onGlobalOptionChange('tags', enabled),
            (setting) => onSiteOptionChange('tags', setting),
            {
              disabled: !effectiveBacklinksEnabled,
              dimmed: !effectiveBacklinksEnabled,
              tooltip: !effectiveBacklinksEnabled ? 'Tags require backlinks' : undefined,
            },
          )}
          {renderRow(
            'Hover Preview',
            globalOptions.hoverPreviewEnabled,
            siteOptions.hoverPreviewSetting,
            (enabled) => onGlobalOptionChange('hoverPreview', enabled),
            (setting) => onSiteOptionChange('hoverPreview', setting),
          )}
          {renderRow(
            'Markdown ZIP',
            globalOptions.markdownZipEnabled,
            siteOptions.markdownZipSetting,
            (enabled) => onGlobalOptionChange('markdownZip', enabled),
            (setting) => onSiteOptionChange('markdownZip', setting),
          )}
          {renderRow(
            'Spaced Repetition',
            globalOptions.spacedRepetitionEnabled,
            siteOptions.spacedRepetitionSetting,
            (enabled) => handleGlobalSpacedRepetitionChange(enabled),
            (setting) => handleSiteSpacedRepetitionChange(setting),
            {
              action: showSrsEdit ? (
                <button
                  type="button"
                  onClick={() => openSrsTagsModal(srsEditScope)}
                  disabled={disabled}
                  className="flex-shrink-0 rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Edit
                </button>
              ) : undefined,
            },
          )}
        </div>
      </div>

      <Modal
        isOpen={isSrsConsentModalOpen}
        onClose={() => {
          if (isSubmittingSrsEnable) return;
          setIsSrsConsentModalOpen(false);
          setPendingSrsEnable(null);
          setModalError(null);
        }}
        title="Enable Spaced Repetition"
        className="w-full max-w-3xl"
      >
        <div className="space-y-4">
          <aside data-callout="warning" className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Meadow will modify matching source pages by inserting a durable GUID comment into each spaced repetition prompt. This change is written back to your source graph.
          </aside>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-medium text-neutral-700">Before</div>
              <pre className="overflow-x-auto rounded border border-neutral-200 bg-neutral-100 p-3 text-xs text-neutral-800">
{`What color is the sky?::Blue
<!--SR:!2026-03-12,3,250-->`}
              </pre>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-neutral-700">After</div>
              <pre className="overflow-x-auto rounded border border-neutral-200 bg-neutral-100 p-3 text-xs text-neutral-800">
{`What color is the sky?::Blue
<!--SR:!2026-03-12,3,250-->

<!--MEADOW_SR_GUID:123e4567f9012-->
`}
              </pre>
            </div>
          </div>

          <div>
            <label htmlFor="srs-tags-input" className="block text-sm font-medium text-neutral-700">
              Tags that mark pages containing SRS prompts
            </label>
            <textarea
              id="srs-tags-input"
              value={modalTagInput}
              onChange={(event) => {
                setModalTagInput(event.target.value);
                setModalError(null);
              }}
              rows={4}
              className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm font-mono text-neutral-800"
              placeholder="#flashcards&#10;#srs"
            />
            <p className="mt-2 text-xs text-neutral-500">
              Use one tag per line, or separate tags with spaces or commas. Nested tags also match.
            </p>
          </div>

          {modalError ? (
            <div className="text-sm text-danger-600">{modalError}</div>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-neutral-200 pt-4">
            <button
              type="button"
              onClick={() => {
                setIsSrsConsentModalOpen(false);
                setPendingSrsEnable(null);
                setModalError(null);
              }}
              disabled={isSubmittingSrsEnable}
              className="rounded border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmSrsEnable}
              disabled={isSubmittingSrsEnable}
              className="rounded bg-btn-confirm-normal px-4 py-2 text-sm text-btn-confirm-text hover:bg-btn-confirm-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmittingSrsEnable ? 'Enabling...' : 'Enable SRS'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isSrsTagsModalOpen}
        onClose={() => {
          if (isSavingTags) return;
          setIsSrsTagsModalOpen(false);
          setTagSaveError(null);
          void handleResetTags();
        }}
        title={scope === 'global' ? 'Edit Global SRS Settings' : 'Edit Site SRS Settings'}
        className="w-full max-w-2xl"
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm text-neutral-600">
              {scope === 'global'
                ? 'These tags are the global default for deciding which source pages should be scanned for spaced repetition prompts.'
                : 'These tags override the global defaults for this site. If unset, the site inherits the global SRS tags.'}
            </p>
          </div>

          {scope === 'site' ? (
            <div className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
              Global: {globalSrsTags.length > 0 ? globalSrsTags.join(', ') : 'No global tags set'}
              <br />
              Effective: {effectiveSrsTags.length > 0 ? effectiveSrsTags.join(', ') : 'No effective tags set'}
              <br />
              Override: {siteSrsTagsOverride ? 'Using site tags' : 'Inheriting global tags'}
            </div>
          ) : null}

          <label htmlFor={`${scope}-srs-tags-input`} className="sr-only">
            {scope === 'global' ? 'Global SRS tags' : 'Site SRS tags'}
          </label>
          <textarea
            id={`${scope}-srs-tags-input`}
            value={tagsEditorValue}
            onChange={(event) => {
              if (scope === 'global') {
                setGlobalTagInput(event.target.value);
              } else {
                setSiteTagInput(event.target.value);
              }
              setTagSaveError(null);
            }}
            disabled={disabled || isSavingTags}
            rows={6}
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm font-mono text-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-50"
            placeholder="#flashcards&#10;#srs"
          />

          <div className="text-xs text-neutral-500">
            Example: <code className="rounded bg-neutral-100 px-1 py-0.5">#flashcards</code> also matches <code className="rounded bg-neutral-100 px-1 py-0.5">#flashcards/ka-quiz</code>.
          </div>

          {tagSaveError ? (
            <div className="text-xs text-danger-600">{tagSaveError}</div>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-neutral-200 pt-4">
            {scope === 'site' ? (
              <button
                type="button"
                onClick={handleUseGlobalTags}
                disabled={disabled || isSavingTags || siteSrsTagsOverride === null}
                className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Use Global Tags
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleResetTags()}
              disabled={disabled || isSavingTags || (scope === 'global' ? !globalTagsDirty : !siteTagsDirty)}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={async () => {
                let saved = false;
                if (scope === 'global') {
                  saved = await handleSaveGlobalTags();
                } else {
                  saved = await handleSaveSiteTags();
                }
                if (saved) {
                  setIsSrsTagsModalOpen(false);
                }
              }}
              disabled={disabled || isSavingTags || (scope === 'global' ? !globalTagsDirty : !siteTagsDirty)}
              className="rounded bg-btn-confirm-normal px-3 py-1.5 text-sm text-btn-confirm-text hover:bg-btn-confirm-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSavingTags ? 'Saving...' : 'Save Tags'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default GenerationOptionsPanel;
