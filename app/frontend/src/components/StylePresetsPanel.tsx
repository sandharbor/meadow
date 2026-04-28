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

import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../utils/apiConfig';
import { StylePreset } from '../../../shared_code/types/stylePresets';
import { logger } from '../utils/logger';
import { ConfigSection } from './configSection';

interface StylePresetsPanelProps {
  siteSlug: string;
  onPresetChanged?: () => void | Promise<void>;
}

interface PresetState {
  presets: StylePreset[];
  globalPresetId: string;
  sitePresetId: string | undefined;
  effectivePresetId: string;
  isInherited: boolean;
}

const StylePresetsPanel: React.FC<StylePresetsPanelProps> = ({ siteSlug, onPresetChanged }) => {
  const [state, setState] = useState<PresetState>({
    presets: [],
    globalPresetId: 'classic',
    sitePresetId: undefined,
    effectivePresetId: 'classic',
    isInherited: true,
  });
  const [scope, setScope] = useState<'global' | 'site'>('site');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadPresets = useCallback(async () => {
    try {
      // Load all presets
      const presetsResponse = await fetch(`${API_BASE_URL}/presets`);
      const presetsData = await presetsResponse.json();

      // Load global preset
      const globalResponse = await fetch(`${API_BASE_URL}/presets/global`);
      const globalData = await globalResponse.json();

      // Load site preset
      const siteResponse = await fetch(`${API_BASE_URL}/presets/site/${siteSlug}`);
      const siteData = await siteResponse.json();

      setState({
        presets: presetsData.presets || [],
        globalPresetId: globalData.presetId || 'classic',
        sitePresetId: siteData.sitePresetId,
        effectivePresetId: siteData.effectivePresetId || 'classic',
        isInherited: siteData.isInherited ?? true,
      });
    } catch (error) {
      logger.error('Error loading presets:', error);
    } finally {
      setIsLoading(false);
    }
  }, [siteSlug]);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  const handlePresetSelect = async (presetId: string | null) => {
    setIsSaving(true);
    try {
      if (scope === 'global') {
        // Update global preset
        const response = await fetch(`${API_BASE_URL}/presets/global`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ presetId }),
        });
        if (response.ok) {
          const data = await response.json();
          setState(prev => ({
            ...prev,
            globalPresetId: data.presetId,
            // If site is inheriting, update effective preset too
            effectivePresetId: prev.isInherited ? data.presetId : prev.effectivePresetId,
          }));
          await onPresetChanged?.();
        }
      } else {
        // Update site preset
        const response = await fetch(`${API_BASE_URL}/presets/site/${siteSlug}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ presetId }),
        });
        if (response.ok) {
          const data = await response.json();
          setState(prev => ({
            ...prev,
            sitePresetId: data.sitePresetId,
            effectivePresetId: data.effectivePresetId,
            isInherited: data.isInherited,
          }));
          await onPresetChanged?.();
        }
      }
    } catch (error) {
      logger.error('Error updating preset:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleInheritToggle = async () => {
    if (state.isInherited) {
      // Switching to site-specific: select the current global preset
      await handlePresetSelect(state.globalPresetId);
    } else {
      // Switching back to inherit: pass null
      await handlePresetSelect(null);
    }
  };

  if (isLoading) {
    return (
      <div className="text-sm text-neutral-500 py-4">
        Loading style presets...
      </div>
    );
  }

  const effectivePresetName = state.presets.find(p => p.id === state.effectivePresetId)?.name || 'Classic Serif';
  const globalPresetName = state.presets.find(p => p.id === state.globalPresetId)?.name || 'Classic Serif';

  const footer = (
    <>
      Currently using:{' '}
      <span className="font-medium text-neutral-700">{effectivePresetName}</span>
      {state.isInherited && scope === 'site' && (
        <span className="ml-1 text-neutral-400">(inherited from global)</span>
      )}
    </>
  );

  return (
    <ConfigSection
      title="Style Presets"
      scope={scope}
      onScopeChange={setScope}
      disabled={isSaving}
      footer={footer}
    >
      <div className="p-3">
        {scope === 'site' && (
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={state.isInherited}
              onChange={handleInheritToggle}
              disabled={isSaving}
              className="w-4 h-4 text-main-600 border-neutral-300 rounded focus:ring-main-500"
            />
            <span className="text-sm text-neutral-700">
              Use global default
              <span className="text-neutral-500 ml-1">({globalPresetName})</span>
            </span>
          </label>
        )}

        {/* Preset cards */}
        <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${scope === 'site' && state.isInherited ? 'opacity-50 pointer-events-none' : ''}`}>
          {state.presets.map(preset => {
            const isSelected = scope === 'global'
              ? state.globalPresetId === preset.id
              : !state.isInherited && state.sitePresetId === preset.id;

            return (
              <button
                key={preset.id}
                onClick={() => handlePresetSelect(preset.id)}
                disabled={isSaving || (scope === 'site' && state.isInherited)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  isSelected
                    ? 'border-main-500 bg-main-50 ring-1 ring-main-500'
                    : 'border-neutral-200 hover:border-neutral-300'
                } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {/* Preview card */}
                <div
                  className="rounded-md p-2 mb-2 text-xs"
                  style={{
                    backgroundColor: preset.preview.backgroundColor,
                    fontFamily: preset.preview.fontFamily,
                  }}
                >
                  <div
                    className="font-bold mb-1"
                    style={{ color: preset.preview.textColor }}
                  >
                    Sample Title
                  </div>
                  <div
                    className="mb-1"
                    style={{ color: preset.preview.textColor }}
                  >
                    Body text with{' '}
                    <span style={{ color: preset.preview.linkColor }}>
                      a link
                    </span>
                  </div>
                  <span
                    className="px-1 rounded text-xs"
                    style={{
                      backgroundColor: preset.preview.codeBackground,
                      color: preset.preview.textColor,
                      fontFamily: 'monospace',
                    }}
                  >
                    code
                  </span>
                </div>

                {/* Preset name and checkmark */}
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-700">{preset.name}</span>
                  {isSelected && (
                    <svg className="w-5 h-5 text-main-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div className="text-xs text-neutral-500 mt-0.5">{preset.description}</div>
              </button>
            );
          })}
        </div>
      </div>
    </ConfigSection>
  );
};

export default StylePresetsPanel;
