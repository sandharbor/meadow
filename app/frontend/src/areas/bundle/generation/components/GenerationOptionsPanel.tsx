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
import Modal from '../../../../shared/components/Modal';
import OpenKnowledgeFormatSettingsModal, {
  type OpenKnowledgeFormatSettings
} from './open-knowledge-format/OpenKnowledgeFormatSettingsModal';

type OverrideSetting = 'inherit' | 'enabled' | 'disabled';

interface GenerationOptionsPanelProps {
  globalOptions: {
    breadcrumbsEnabled: boolean;
    backlinksEnabled: boolean;
    tagsEnabled: boolean;
    searchEnabled: boolean;
    hoverPreviewEnabled: boolean;
    folderNavigationEnabled: boolean;
    sourcesExportEnabled: boolean;
    openKnowledgeFormatEnabled: boolean;
    spacedRepetitionEnabled: boolean;
  };
  bundleOptions: {
    breadcrumbsSetting: OverrideSetting;
    backlinksSetting: OverrideSetting;
    tagsSetting: OverrideSetting;
    searchSetting: OverrideSetting;
    hoverPreviewSetting: OverrideSetting;
    folderNavigationSetting: OverrideSetting;
    sourcesExportSetting: OverrideSetting;
    openKnowledgeFormatSetting: OverrideSetting;
    spacedRepetitionSetting: OverrideSetting;
  };
  globalSrsTags: string[];
  bundleSrsTagsOverride: string[] | null;
  bundleSlug: string;
  onGlobalOptionChange: (option: 'breadcrumbs' | 'backlinks' | 'tags' | 'search' | 'hoverPreview' | 'folderNavigation' | 'sourcesExport' | 'openKnowledgeFormat' | 'spacedRepetition', enabled: boolean) => Promise<void>;
  onBundleOptionChange: (option: 'breadcrumbs' | 'backlinks' | 'tags' | 'search' | 'hoverPreview' | 'folderNavigation' | 'sourcesExport' | 'openKnowledgeFormat' | 'spacedRepetition', setting: OverrideSetting) => Promise<void>;
  onGlobalSrsTagsChange: (tags: string[]) => Promise<void>;
  onBundleSrsTagsChange: (tags: string[] | null) => Promise<void>;
  onGlobalSrsEnable: (tags: string[]) => Promise<void>;
  onBundleSrsEnable: (setting: OverrideSetting, tags: string[]) => Promise<void>;
  onBundleOkfLogSettingsChange: (settings: OpenKnowledgeFormatSettings) => Promise<void>;
  onBundleOkfEnable: (setting: OverrideSetting, settings: OpenKnowledgeFormatSettings) => Promise<void>;
  openKnowledgeFormatRenameCount?: number;
  onOpenKnowledgeFormatRenameDetails?: () => void;
  disabled?: boolean;
}

type PendingSrsEnable =
  | { scope: 'global' }
  | { scope: 'bundle'; setting: OverrideSetting };

type PendingOkfEnable =
  | { scope: 'bundle'; setting: OverrideSetting }
  | { scope: 'edit' };

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

const BUNDLE_OPTIONS = [
  { value: 'inherit', label: '\u2014' },
  { value: 'enabled', label: 'On' },
  { value: 'disabled', label: 'Off' },
];

const BUNDLE_ONLY_OPTIONS = [
  { value: 'disabled', label: 'Off' },
  { value: 'enabled', label: 'On' },
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
  bundleOptions,
  globalSrsTags,
  bundleSrsTagsOverride,
  bundleSlug,
  onGlobalOptionChange,
  onBundleOptionChange,
  onGlobalSrsTagsChange,
  onBundleSrsTagsChange,
  onGlobalSrsEnable,
  onBundleSrsEnable,
  onBundleOkfLogSettingsChange,
  onBundleOkfEnable,
  openKnowledgeFormatRenameCount = 0,
  onOpenKnowledgeFormatRenameDetails,
  disabled,
}) => {
  // scope is only used by the SRS tags modal
  const [scope, setScope] = useState<'global' | 'bundle'>('bundle');
  const [isSrsConsentModalOpen, setIsSrsConsentModalOpen] = useState(false);
  const [isSrsTagsModalOpen, setIsSrsTagsModalOpen] = useState(false);
  const [pendingSrsEnable, setPendingSrsEnable] = useState<PendingSrsEnable | null>(null);
  const [modalTagInput, setModalTagInput] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [globalTagInput, setGlobalTagInput] = useState(tagsToInput(globalSrsTags));
  const [bundleTagInput, setBundleTagInput] = useState(tagsToInput(bundleSrsTagsOverride ?? []));
  const [tagSaveError, setTagSaveError] = useState<string | null>(null);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [isSubmittingSrsEnable, setIsSubmittingSrsEnable] = useState(false);
  const [isOkfSettingsModalOpen, setIsOkfSettingsModalOpen] = useState(false);
  const [pendingOkfEnable, setPendingOkfEnable] = useState<PendingOkfEnable | null>(null);

  useEffect(() => {
    setGlobalTagInput(tagsToInput(globalSrsTags));
  }, [globalSrsTags]);

  const effectiveBacklinksEnabled =
    bundleOptions.backlinksSetting === 'inherit'
      ? globalOptions.backlinksEnabled
      : bundleOptions.backlinksSetting === 'enabled';

  const effectiveSpacedRepetitionEnabled =
    bundleOptions.spacedRepetitionSetting === 'inherit'
      ? globalOptions.spacedRepetitionEnabled
      : bundleOptions.spacedRepetitionSetting === 'enabled';

  const effectiveOpenKnowledgeFormatEnabled = bundleOptions.openKnowledgeFormatSetting === 'enabled';

  const effectiveSrsTags = useMemo(
    () => bundleSrsTagsOverride ?? globalSrsTags,
    [bundleSrsTagsOverride, globalSrsTags]
  );
  const bundleTagBaseline = useMemo(
    () => bundleSrsTagsOverride ?? (bundleOptions.spacedRepetitionSetting === 'enabled' ? globalSrsTags : []),
    [bundleSrsTagsOverride, bundleOptions.spacedRepetitionSetting, globalSrsTags]
  );

  useEffect(() => {
    setBundleTagInput(tagsToInput(bundleTagBaseline));
  }, [bundleTagBaseline]);

  const openSrsConsentModal = (pending: PendingSrsEnable) => {
    setPendingSrsEnable(pending);
    const seededTags = pending.scope === 'global'
      ? globalSrsTags
      : (bundleSrsTagsOverride ?? globalSrsTags);
    setModalTagInput(tagsToInput(seededTags.length > 0 ? seededTags : [DEFAULT_SRS_TAG]));
    setModalError(null);
    setIsSrsConsentModalOpen(true);
  };

  const openSrsTagsModal = (modalScope: 'global' | 'bundle') => {
    setScope(modalScope);
    setTagSaveError(null);
    if (modalScope === 'global') {
      setGlobalTagInput(tagsToInput(globalSrsTags));
    } else {
      setBundleTagInput(tagsToInput(bundleTagBaseline));
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

  const handleBundleSpacedRepetitionChange = async (setting: OverrideSetting) => {
    const nextEffective = setting === 'inherit'
      ? globalOptions.spacedRepetitionEnabled
      : setting === 'enabled';

    if (nextEffective && !effectiveSpacedRepetitionEnabled) {
      openSrsConsentModal({ scope: 'bundle', setting });
      return;
    }

    await onBundleOptionChange('spacedRepetition', setting);
  };

  const openOkfSettingsModal = (pending: PendingOkfEnable) => {
    setPendingOkfEnable(pending);
    setIsOkfSettingsModalOpen(true);
  };

  const handleBundleOpenKnowledgeFormatChange = async (setting: OverrideSetting) => {
    const nextEffective = setting === 'enabled';

    if (nextEffective && !effectiveOpenKnowledgeFormatEnabled) {
      openOkfSettingsModal({ scope: 'bundle', setting });
      return;
    }

    await onBundleOptionChange('openKnowledgeFormat', setting);
  };

  const handleConfirmOkfSettings = async (settings: OpenKnowledgeFormatSettings) => {
    if (!pendingOkfEnable || pendingOkfEnable.scope === 'edit') {
      await onBundleOkfLogSettingsChange(settings);
      return;
    }

    await onBundleOkfEnable(pendingOkfEnable.setting, settings);
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
        await onBundleSrsEnable(pendingSrsEnable.setting, parsedTags);
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
  const parsedBundleTags = normalizeSrsTags(bundleTagInput);
  const globalTagsDirty = tagsToInput(parsedGlobalTags) !== tagsToInput(globalSrsTags);
  const bundleTagsDirty = tagsToInput(parsedBundleTags) !== tagsToInput(bundleTagBaseline);

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

  const handleSaveBundleTags = async (): Promise<boolean> => {
    if (effectiveSpacedRepetitionEnabled && parsedBundleTags.length === 0) {
      setTagSaveError('Spaced repetition requires at least one matching tag.');
      return false;
    }

    setIsSavingTags(true);
    setTagSaveError(null);
    try {
      await onBundleSrsTagsChange(parsedBundleTags);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save bundle SRS tags.';
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
    setBundleTagInput(tagsToInput(bundleTagBaseline));
  };

  const handleUseGlobalTags = async () => {
    setIsSavingTags(true);
    setTagSaveError(null);
    try {
      await onBundleSrsTagsChange(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to clear bundle SRS tag override.';
      setTagSaveError(message);
    } finally {
      setIsSavingTags(false);
    }
  };

  const tagsEditorValue = scope === 'global' ? globalTagInput : bundleTagInput;
  const canEditGlobalTags = globalOptions.spacedRepetitionEnabled;
  const canEditBundleTags = bundleOptions.spacedRepetitionSetting === 'enabled';
  const showSrsEdit = canEditGlobalTags || canEditBundleTags;
  const srsEditScope = canEditBundleTags ? 'bundle' : 'global';

  const renderRow = (
    name: string,
    globalValue: boolean,
    bundleSetting: OverrideSetting,
    onGlobalChange: (enabled: boolean) => void | Promise<void>,
    onBundleChange: (setting: OverrideSetting) => void | Promise<void>,
    opts?: { disabled?: boolean; dimmed?: boolean; tooltip?: string; action?: React.ReactNode },
  ) => {
    const hasOverride = bundleSetting !== 'inherit';
    const globalColorClass = hasOverride
      ? 'text-neutral-300'
      : globalValue ? 'text-success-600' : 'text-neutral-500';
    const bundleColorClass = bundleSetting === 'inherit'
      ? 'text-neutral-300'
      : bundleSetting === 'enabled' ? 'text-success-600' : 'text-neutral-500';

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
          value={bundleSetting}
          options={BUNDLE_OPTIONS}
          onChange={(val) => onBundleChange(val as OverrideSetting)}
          colorClass={bundleColorClass}
          disabled={opts?.disabled || disabled}
        />
      </div>
    );
  };

  const renderBundleOnlyOkfRow = () => {
    const bundleSetting = effectiveOpenKnowledgeFormatEnabled ? 'enabled' : 'disabled';
    const bundleColorClass = effectiveOpenKnowledgeFormatEnabled ? 'text-success-600' : 'text-neutral-500';

    return (
      <div className="grid grid-cols-[1fr,60px,60px] items-center gap-2 px-3 py-2 border-b border-neutral-100">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-neutral-700 truncate">Open Knowledge Format (OKF)</span>
          {effectiveOpenKnowledgeFormatEnabled ? (
            <button
              type="button"
              onClick={() => openOkfSettingsModal({ scope: 'edit' })}
              disabled={disabled}
              className="flex-shrink-0 rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Edit
            </button>
          ) : null}
          {openKnowledgeFormatRenameCount > 0 && onOpenKnowledgeFormatRenameDetails ? (
            <button
              type="button"
              onClick={onOpenKnowledgeFormatRenameDetails}
              className="flex-shrink-0 rounded border border-warning-300 bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-800 hover:bg-warning-100"
              title="View OKF reserved file renames"
            >
              {openKnowledgeFormatRenameCount} renamed
            </button>
          ) : null}
        </div>
        <div className="text-center text-xs text-neutral-300" title="OKF is configured per bundle">
          Bundle only
        </div>
        <HoverSelect
          value={bundleSetting}
          options={BUNDLE_ONLY_OPTIONS}
          onChange={(val) => handleBundleOpenKnowledgeFormatChange(val as OverrideSetting)}
          colorClass={bundleColorClass}
          disabled={disabled}
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
            <span className="text-center">Bundle</span>
          </div>

          {renderRow(
            'Breadcrumbs',
            globalOptions.breadcrumbsEnabled,
            bundleOptions.breadcrumbsSetting,
            (enabled) => onGlobalOptionChange('breadcrumbs', enabled),
            (setting) => onBundleOptionChange('breadcrumbs', setting),
          )}
          {renderRow(
            'Backlinks',
            globalOptions.backlinksEnabled,
            bundleOptions.backlinksSetting,
            (enabled) => onGlobalOptionChange('backlinks', enabled),
            (setting) => onBundleOptionChange('backlinks', setting),
          )}
          {renderRow(
            'Tags',
            globalOptions.tagsEnabled && globalOptions.backlinksEnabled,
            bundleOptions.tagsSetting,
            (enabled) => onGlobalOptionChange('tags', enabled),
            (setting) => onBundleOptionChange('tags', setting),
            {
              disabled: !effectiveBacklinksEnabled,
              dimmed: !effectiveBacklinksEnabled,
              tooltip: !effectiveBacklinksEnabled ? 'Tags require backlinks' : undefined,
            },
          )}
          {renderRow(
            'Search',
            globalOptions.searchEnabled,
            bundleOptions.searchSetting,
            (enabled) => onGlobalOptionChange('search', enabled),
            (setting) => onBundleOptionChange('search', setting),
          )}
          {renderRow(
            'Hover Preview',
            globalOptions.hoverPreviewEnabled,
            bundleOptions.hoverPreviewSetting,
            (enabled) => onGlobalOptionChange('hoverPreview', enabled),
            (setting) => onBundleOptionChange('hoverPreview', setting),
          )}
          {renderRow(
            'Folder Navigation',
            globalOptions.folderNavigationEnabled,
            bundleOptions.folderNavigationSetting,
            (enabled) => onGlobalOptionChange('folderNavigation', enabled),
            (setting) => onBundleOptionChange('folderNavigation', setting),
          )}
          {renderRow(
            'Sources ZIP',
            globalOptions.sourcesExportEnabled,
            bundleOptions.sourcesExportSetting,
            (enabled) => onGlobalOptionChange('sourcesExport', enabled),
            (setting) => onBundleOptionChange('sourcesExport', setting),
          )}
          {renderBundleOnlyOkfRow()}
          {renderRow(
            'Spaced Repetition',
            globalOptions.spacedRepetitionEnabled,
            bundleOptions.spacedRepetitionSetting,
            (enabled) => handleGlobalSpacedRepetitionChange(enabled),
            (setting) => handleBundleSpacedRepetitionChange(setting),
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
        title={scope === 'global' ? 'Edit Global SRS Settings' : 'Edit Bundle SRS Settings'}
        className="w-full max-w-2xl"
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm text-neutral-600">
              {scope === 'global'
                ? 'These tags are the global default for deciding which source pages should be scanned for spaced repetition prompts.'
                : 'These tags override the global defaults for this bundle. If unset, the bundle inherits the global SRS tags.'}
            </p>
          </div>

          {scope === 'bundle' ? (
            <div className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
              Global: {globalSrsTags.length > 0 ? globalSrsTags.join(', ') : 'No global tags set'}
              <br />
              Effective: {effectiveSrsTags.length > 0 ? effectiveSrsTags.join(', ') : 'No effective tags set'}
              <br />
              Override: {bundleSrsTagsOverride ? 'Using bundle tags' : 'Inheriting global tags'}
            </div>
          ) : null}

          <label htmlFor={`${scope}-srs-tags-input`} className="sr-only">
            {scope === 'global' ? 'Global SRS tags' : 'Bundle SRS tags'}
          </label>
          <textarea
            id={`${scope}-srs-tags-input`}
            value={tagsEditorValue}
            onChange={(event) => {
              if (scope === 'global') {
                setGlobalTagInput(event.target.value);
              } else {
                setBundleTagInput(event.target.value);
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
            {scope === 'bundle' ? (
              <button
                type="button"
                onClick={handleUseGlobalTags}
                disabled={disabled || isSavingTags || bundleSrsTagsOverride === null}
                className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Use Global Tags
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleResetTags()}
              disabled={disabled || isSavingTags || (scope === 'global' ? !globalTagsDirty : !bundleTagsDirty)}
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
                  saved = await handleSaveBundleTags();
                }
                if (saved) {
                  setIsSrsTagsModalOpen(false);
                }
              }}
              disabled={disabled || isSavingTags || (scope === 'global' ? !globalTagsDirty : !bundleTagsDirty)}
              className="rounded bg-btn-confirm-normal px-3 py-1.5 text-sm text-btn-confirm-text hover:bg-btn-confirm-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSavingTags ? 'Saving...' : 'Save Tags'}
            </button>
          </div>
        </div>
      </Modal>

      <OpenKnowledgeFormatSettingsModal
        bundleSlug={bundleSlug}
        isOpen={isOkfSettingsModalOpen}
        confirmLabel={pendingOkfEnable?.scope === 'edit' ? 'Save Settings' : 'Enable OKF'}
        onClose={() => {
          setIsOkfSettingsModalOpen(false);
          setPendingOkfEnable(null);
        }}
        onConfirm={handleConfirmOkfSettings}
      />
    </>
  );
};

export default GenerationOptionsPanel;
