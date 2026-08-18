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

/* global alert, confirm */
import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../../../shared/utils/apiClient';
import { CustomAssetType } from '../../../../../../shared_code/types/customAssets';
import { logger } from '../../../../shared/utils/logger';
import FloatingCodeEditor from './FloatingCodeEditor';

interface CustomAssetsPanelProps {
  bundleSlug: string;
  onCustomAssetsChanged?: () => void | Promise<void>;
}

interface AssetInfo {
  assetType: CustomAssetType;
  label: string;
  language: string;
  globalExists: boolean;
  bundleExists: boolean;
}

const ASSET_TYPES: Array<{ type: CustomAssetType; label: string; language: string }> = [
  { type: 'style_css', label: 'CSS', language: 'css' },
  { type: 'javascript_js', label: 'JS', language: 'javascript' },
];

const CustomAssetsPanel: React.FC<CustomAssetsPanelProps> = ({ bundleSlug, onCustomAssetsChanged }) => {
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [disableBaseStyleCss, setDisableBaseStyleCss] = useState(false);
  const [disableBaseJavascriptJs, setDisableBaseJavascriptJs] = useState(false);
  const [bundleDisableBaseStyleCss, setBundleDisableBaseStyleCss] = useState<boolean | undefined>(undefined);
  const [bundleDisableBaseJavascriptJs, setBundleDisableBaseJavascriptJs] = useState<boolean | undefined>(undefined);

  // Editor state
  const [editingAsset, setEditingAsset] = useState<{
    assetType: CustomAssetType;
    scope: 'global' | 'bundle';
  } | null>(null);
  const [assetContent, setAssetContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const loadAssets = useCallback(async () => {
    try {
      const resp = await apiRequest(`bundles/${bundleSlug}/generation/custom-assets`);
      if (!resp.ok) return;
      const data = await resp.json();

      const assetInfos: AssetInfo[] = ASSET_TYPES.map(({ type, label, language }) => {
        const globalMeta = data.globalAssets?.find((a: { assetType: string }) => a.assetType === type);
        const bundleMeta = data.bundleAssets?.find((a: { assetType: string }) => a.assetType === type);
        return {
          assetType: type,
          label,
          language,
          globalExists: globalMeta?.exists ?? false,
          bundleExists: bundleMeta?.exists ?? false,
        };
      });

      setAssets(assetInfos);
      setDisableBaseStyleCss(data.disableBaseStyleCss ?? false);
      setDisableBaseJavascriptJs(data.disableBaseJavascriptJs ?? false);
      setBundleDisableBaseStyleCss(data.bundleDisableBaseStyleCss);
      setBundleDisableBaseJavascriptJs(data.bundleDisableBaseJavascriptJs);
    } catch (error) {
      logger.error('Failed to load custom assets', error);
    }
  }, [bundleSlug]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  const openEditor = async (assetType: CustomAssetType, editorScope: 'global' | 'bundle') => {
    try {
      const url = editorScope === 'global'
        ? `generation/custom-assets/global/${assetType}`
        : `bundles/${bundleSlug}/generation/custom-assets/${assetType}`;
      const resp = await apiRequest(url);
      if (!resp.ok) return;
      const data = await resp.json();
      const content = data.content || '';
      setAssetContent(content);
      setOriginalContent(content);
      setHasChanges(false);
      setEditingAsset({ assetType, scope: editorScope });
    } catch (error) {
      logger.error('Failed to load asset content', error);
    }
  };

  const saveAsset = async () => {
    if (!editingAsset) return;
    setIsSaving(true);
    try {
      const url = editingAsset.scope === 'global'
        ? `generation/custom-assets/global/${editingAsset.assetType}`
        : `bundles/${bundleSlug}/generation/custom-assets/${editingAsset.assetType}`;
      const resp = await apiRequest(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: assetContent }),
      });
      if (!resp.ok) {
        alert('Failed to save');
        return;
      }
      setOriginalContent(assetContent);
      setHasChanges(false);
      await loadAssets();
      await onCustomAssetsChanged?.();
    } catch (error) {
      logger.error('Failed to save asset', error);
      alert('Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteAsset = async () => {
    if (!editingAsset) return;
    if (!confirm('Delete this custom asset?')) return;
    try {
      const url = editingAsset.scope === 'global'
        ? `generation/custom-assets/global/${editingAsset.assetType}`
        : `bundles/${bundleSlug}/generation/custom-assets/${editingAsset.assetType}`;
      await apiRequest(url, { method: 'DELETE' });
      setEditingAsset(null);
      setAssetContent('');
      setOriginalContent('');
      await loadAssets();
      await onCustomAssetsChanged?.();
    } catch (error) {
      logger.error('Failed to delete asset', error);
    }
  };

  const handleFloatingClose = () => {
    if (editingAsset) {
      loadAssets();
    }
    setEditingAsset(null);
    setAssetContent('');
    setOriginalContent('');
  };

  const toggleBaseDisabled = async (
    assetKey: 'disableBaseStyleCss' | 'disableBaseJavascriptJs',
    value: boolean,
    toggleScope: 'global' | 'bundle',
  ) => {
    try {
      const url = toggleScope === 'global'
        ? `generation/custom-assets/global/base-disabled`
        : `bundles/${bundleSlug}/generation/custom-assets/base-disabled`;
      await apiRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [assetKey]: value }),
      });
      await loadAssets();
      await onCustomAssetsChanged?.();
    } catch (error) {
      logger.error('Failed to toggle base disabled', error);
    }
  };

  const currentLanguage = editingAsset
    ? ASSET_TYPES.find(a => a.type === editingAsset.assetType)?.language || 'css'
    : 'css';

  // Get override state for the currently editing asset
  const getIsOverride = (): boolean => {
    if (!editingAsset) return false;
    const isCss = editingAsset.assetType === 'style_css';
    if (editingAsset.scope === 'global') {
      return isCss ? disableBaseStyleCss : disableBaseJavascriptJs;
    }
    const bundleVal = isCss ? bundleDisableBaseStyleCss : bundleDisableBaseJavascriptJs;
    const globalVal = isCss ? disableBaseStyleCss : disableBaseJavascriptJs;
    return bundleVal !== undefined ? bundleVal : globalVal;
  };

  const editorToolbar = editingAsset ? (() => {
    const isOverride = getIsOverride();
    const assetKey: 'disableBaseStyleCss' | 'disableBaseJavascriptJs' =
      editingAsset.assetType === 'style_css' ? 'disableBaseStyleCss' : 'disableBaseJavascriptJs';

    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-neutral-500">Mode:</span>
        <div className="inline-flex rounded border border-neutral-300 overflow-hidden">
          <button
            type="button"
            className={`px-2 py-0.5 ${!isOverride ? 'bg-main-100 text-main-700 font-medium' : 'text-neutral-500 hover:bg-neutral-100'}`}
            onClick={() => toggleBaseDisabled(assetKey, false, editingAsset.scope)}
          >
            Append
          </button>
          <button
            type="button"
            className={`px-2 py-0.5 border-l border-neutral-300 ${isOverride ? 'bg-main-100 text-main-700 font-medium' : 'text-neutral-500 hover:bg-neutral-100'}`}
            onClick={() => toggleBaseDisabled(assetKey, true, editingAsset.scope)}
          >
            Override
          </button>
        </div>
        <span className="text-neutral-400">
          {isOverride ? 'Replaces preset' : 'Adds to preset'}
        </span>
      </div>
    );
  })() : null;

  const assetLabel = editingAsset
    ? ASSET_TYPES.find(a => a.type === editingAsset.assetType)?.label || ''
    : '';

  const renderRow = (asset: AssetInfo) => {
    const isCss = asset.assetType === 'style_css';
    const globalDisableBase = isCss ? disableBaseStyleCss : disableBaseJavascriptJs;
    const bundleDisableBase = isCss ? bundleDisableBaseStyleCss : bundleDisableBaseJavascriptJs;
    const effectiveDisableBase = bundleDisableBase !== undefined ? bundleDisableBase : globalDisableBase;

    // Bundle: null if no asset
    const bundleEffectiveDisable = bundleDisableBase !== undefined ? bundleDisableBase : globalDisableBase;
    const bundleMode = asset.bundleExists
      ? (bundleEffectiveDisable ? 'override' : 'append')
      : null;

    // When bundle overrides, everything to its left fades
    const bundleOverrides = bundleMode === 'override';

    // Preset: faded if overridden by global or bundle
    const presetFaded = effectiveDisableBase;

    // Global: faded if bundle overrides (everything left of bundle fades)
    const globalFaded = bundleOverrides;
    const globalMode = asset.globalExists
      ? (globalDisableBase ? 'override' : 'append')
      : null;

    return (
      <div
        key={asset.assetType}
        className="grid grid-cols-[1fr,60px,60px,60px] items-center gap-2 px-3 py-2 border-b border-neutral-100 last:border-b-0"
      >
        <span className="text-neutral-700 truncate min-w-0">{asset.label}</span>

        {/* Preset */}
        <span className={`text-xs text-center ${presetFaded ? 'text-neutral-300' : 'text-success-600'}`}>
          {presetFaded ? 'Off' : 'On'}
        </span>

        {/* Global */}
        <button
          type="button"
          onClick={() => openEditor(asset.assetType, 'global')}
          className="text-xs text-center cursor-pointer hover:bg-main-50 rounded py-0.5 transition-colors group/cell"
        >
          {globalMode === null ? (
            <span className="text-neutral-300 group-hover/cell:text-main-500">{'\u2014'}</span>
          ) : globalFaded ? (
            <span className="text-neutral-300">Off</span>
          ) : globalMode === 'append' ? (
            <span className="text-success-600">+</span>
          ) : (
            <span className="text-success-600">On</span>
          )}
        </button>

        {/* Bundle */}
        <button
          type="button"
          onClick={() => openEditor(asset.assetType, 'bundle')}
          className="text-xs text-center cursor-pointer hover:bg-main-50 rounded py-0.5 transition-colors group/cell"
        >
          {bundleMode === 'append' ? (
            <span className="text-success-600">+</span>
          ) : bundleMode === 'override' ? (
            <span className="text-success-600">On</span>
          ) : (
            <span className="text-neutral-300 group-hover/cell:text-main-500">{'\u2014'}</span>
          )}
        </button>
      </div>
    );
  };

  return (
    <>
      <div className="text-sm">
        <div className="font-medium text-neutral-700 mb-3">Custom Assets</div>
        <div className="rounded border border-neutral-200">
          <div className="grid grid-cols-[1fr,60px,60px,60px] items-center gap-2 px-3 py-2 bg-neutral-50 border-b border-neutral-200 text-xs font-medium text-neutral-500">
            <span>Asset</span>
            <span className="text-center">Preset</span>
            <span className="text-center">Global</span>
            <span className="text-center">Bundle</span>
          </div>
          {assets.map(asset => renderRow(asset))}
        </div>
      </div>

      {editingAsset && (
        <FloatingCodeEditor
          title={`${assetLabel} (${editingAsset.scope === 'global' ? 'Global' : 'Bundle'})`}
          language={currentLanguage}
          content={assetContent}
          onContentChange={(code) => {
            setAssetContent(code);
            setHasChanges(code !== originalContent);
          }}
          onSave={saveAsset}
          onClose={handleFloatingClose}
          onDelete={originalContent ? deleteAsset : undefined}
          isSaving={isSaving}
          hasChanges={hasChanges}
          toolbar={editorToolbar}
        />
      )}
    </>
  );
};

export default CustomAssetsPanel;
