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
import { API_BASE_URL } from '../utils/apiConfig';
import { CustomAssetType } from '../../../shared_code/types/customAssets';
import { logger } from '../utils/logger';
import FloatingCodeEditor from './FloatingCodeEditor';

interface CustomAssetsPanelProps {
  siteSlug: string;
  onCustomAssetsChanged?: () => void | Promise<void>;
}

interface AssetInfo {
  assetType: CustomAssetType;
  label: string;
  language: string;
  globalExists: boolean;
  siteExists: boolean;
}

const ASSET_TYPES: Array<{ type: CustomAssetType; label: string; language: string }> = [
  { type: 'style_css', label: 'CSS', language: 'css' },
  { type: 'javascript_js', label: 'JS', language: 'javascript' },
];

const CustomAssetsPanel: React.FC<CustomAssetsPanelProps> = ({ siteSlug, onCustomAssetsChanged }) => {
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [disableBaseStyleCss, setDisableBaseStyleCss] = useState(false);
  const [disableBaseJavascriptJs, setDisableBaseJavascriptJs] = useState(false);
  const [siteDisableBaseStyleCss, setSiteDisableBaseStyleCss] = useState<boolean | undefined>(undefined);
  const [siteDisableBaseJavascriptJs, setSiteDisableBaseJavascriptJs] = useState<boolean | undefined>(undefined);

  // Editor state
  const [editingAsset, setEditingAsset] = useState<{
    assetType: CustomAssetType;
    scope: 'global' | 'site';
  } | null>(null);
  const [assetContent, setAssetContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const loadAssets = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/custom-assets/site/${siteSlug}`);
      if (!resp.ok) return;
      const data = await resp.json();

      const assetInfos: AssetInfo[] = ASSET_TYPES.map(({ type, label, language }) => {
        const globalMeta = data.globalAssets?.find((a: { assetType: string }) => a.assetType === type);
        const siteMeta = data.siteAssets?.find((a: { assetType: string }) => a.assetType === type);
        return {
          assetType: type,
          label,
          language,
          globalExists: globalMeta?.exists ?? false,
          siteExists: siteMeta?.exists ?? false,
        };
      });

      setAssets(assetInfos);
      setDisableBaseStyleCss(data.disableBaseStyleCss ?? false);
      setDisableBaseJavascriptJs(data.disableBaseJavascriptJs ?? false);
      setSiteDisableBaseStyleCss(data.siteDisableBaseStyleCss);
      setSiteDisableBaseJavascriptJs(data.siteDisableBaseJavascriptJs);
    } catch (error) {
      logger.error('Failed to load custom assets', error);
    }
  }, [siteSlug]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  const openEditor = async (assetType: CustomAssetType, editorScope: 'global' | 'site') => {
    try {
      const url = editorScope === 'global'
        ? `${API_BASE_URL}/custom-assets/global/${assetType}`
        : `${API_BASE_URL}/custom-assets/site/${siteSlug}/${assetType}`;
      const resp = await fetch(url);
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
        ? `${API_BASE_URL}/custom-assets/global/${editingAsset.assetType}`
        : `${API_BASE_URL}/custom-assets/site/${siteSlug}/${editingAsset.assetType}`;
      const resp = await fetch(url, {
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
        ? `${API_BASE_URL}/custom-assets/global/${editingAsset.assetType}`
        : `${API_BASE_URL}/custom-assets/site/${siteSlug}/${editingAsset.assetType}`;
      await fetch(url, { method: 'DELETE' });
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
    toggleScope: 'global' | 'site',
  ) => {
    try {
      const url = toggleScope === 'global'
        ? `${API_BASE_URL}/custom-assets/global/base-disabled`
        : `${API_BASE_URL}/custom-assets/site/${siteSlug}/base-disabled`;
      await fetch(url, {
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
    const siteVal = isCss ? siteDisableBaseStyleCss : siteDisableBaseJavascriptJs;
    const globalVal = isCss ? disableBaseStyleCss : disableBaseJavascriptJs;
    return siteVal !== undefined ? siteVal : globalVal;
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
    const siteDisableBase = isCss ? siteDisableBaseStyleCss : siteDisableBaseJavascriptJs;
    const effectiveDisableBase = siteDisableBase !== undefined ? siteDisableBase : globalDisableBase;

    // Site: null if no asset
    const siteEffectiveDisable = siteDisableBase !== undefined ? siteDisableBase : globalDisableBase;
    const siteMode = asset.siteExists
      ? (siteEffectiveDisable ? 'override' : 'append')
      : null;

    // When site overrides, everything to its left fades
    const siteOverrides = siteMode === 'override';

    // Preset: faded if overridden by global or site
    const presetFaded = effectiveDisableBase;

    // Global: faded if site overrides (everything left of site fades)
    const globalFaded = siteOverrides;
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

        {/* Site */}
        <button
          type="button"
          onClick={() => openEditor(asset.assetType, 'site')}
          className="text-xs text-center cursor-pointer hover:bg-main-50 rounded py-0.5 transition-colors group/cell"
        >
          {siteMode === 'append' ? (
            <span className="text-success-600">+</span>
          ) : siteMode === 'override' ? (
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
            <span className="text-center">Site</span>
          </div>
          {assets.map(asset => renderRow(asset))}
        </div>
      </div>

      {editingAsset && (
        <FloatingCodeEditor
          title={`${assetLabel} (${editingAsset.scope === 'global' ? 'Global' : 'Site'})`}
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
