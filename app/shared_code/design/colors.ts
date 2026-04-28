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

/**
 * Centralized color configuration for the main app.
 * 
 * This is the single source of truth for:
 * - Base palette colors (main, neutral, danger, etc.)
 * - Semantic button colors (btn-standard, btn-confirm, etc.)
 * 
 * Used by:
 * - frontend/tailwind.config.js (generates Tailwind classes)
 * - dev_tools_app Colors.tsx (displays the design system reference)
 */

// =============================================================================
// Base Palette Colors
// =============================================================================

export const mainPalette = {
  50: '#f0fdfa',
  100: '#ccfbf1',
  200: '#99f6e4',
  300: '#5eead4',
  400: '#2dd4bf',
  500: '#14b8a6',
  600: '#0d9488',
  700: '#0f766e',
  800: '#115e59',
  900: '#134e4a',
  950: '#042f2e',
} as const;

export const neutralPalette = {
  50: '#f8fafc',
  100: '#f1f5f9',
  200: '#e2e8f0',
  300: '#cbd5e1',
  400: '#94a3b8',
  500: '#64748b',
  600: '#475569',
  700: '#334155',
  800: '#1e293b',
  900: '#0f172a',
  950: '#020617',
} as const;

export const dangerPalette = {
  50: '#fef2f2',
  100: '#fee2e2',
  200: '#fecaca',
  300: '#fca5a5',
  400: '#f87171',
  500: '#ef4444',
  600: '#dc2626',
  700: '#b91c1c',
  800: '#991b1b',
  900: '#7f1d1d',
  950: '#450a0a',
} as const;

export const warningPalette = {
  50: '#fffbeb',
  100: '#fef3c7',
  200: '#fde68a',
  300: '#fcd34d',
  400: '#fbbf24',
  500: '#f59e0b',
  600: '#d97706',
  700: '#b45309',
  800: '#92400e',
  900: '#78350f',
  950: '#451a03',
} as const;

export const successPalette = {
  50: '#ecfdf5',
  100: '#d1fae5',
  200: '#a7f3d0',
  300: '#6ee7b7',
  400: '#34d399',
  500: '#10b981',
  600: '#059669',
  700: '#047857',
  800: '#065f46',
  900: '#064e3b',
  950: '#022c22',
} as const;

export const infoPalette = {
  50: '#f0f9ff',
  100: '#e0f2fe',
  200: '#bae6fd',
  300: '#7dd3fc',
  400: '#38bdf8',
  500: '#0ea5e9',
  600: '#0284c7',
  700: '#0369a1',
  800: '#075985',
  900: '#0c4a6e',
  950: '#082f49',
} as const;

// All palettes combined for Tailwind config
export const palettes = {
  main: mainPalette,
  neutral: neutralPalette,
  danger: dangerPalette,
  warning: warningPalette,
  success: successPalette,
  info: infoPalette,
} as const;

// =============================================================================
// Semantic Button Colors
// =============================================================================

export interface SemanticButtonConfig {
  name: string;
  label: string;
  description: string;
  colors: {
    normal: string;
    hover: string;
    text: string;
  };
  /** Which palette colors these map to (for documentation) */
  paletteMapping: string;
  /** Example use cases */
  examples: string;
}

export const semanticButtons: SemanticButtonConfig[] = [
  {
    name: 'btn-standard',
    label: 'Standard Button',
    description: 'Default action button for most interactions',
    colors: {
      normal: mainPalette[500],
      hover: mainPalette[600],
      text: '#ffffff',
    },
    paletteMapping: 'main-500 / main-600',
    examples: 'Select All Visible, Add Custom Filter',
  },
  {
    name: 'btn-confirm',
    label: 'Confirm Button',
    description: 'Positive/confirmation actions',
    colors: {
      normal: successPalette[500],
      hover: successPalette[600],
      text: '#ffffff',
    },
    paletteMapping: 'success-500 / success-600',
    examples: 'Save, Confirm, Create',
  },
  {
    name: 'btn-cancel',
    label: 'Cancel Button',
    description: 'Neutral/cancel actions',
    colors: {
      normal: neutralPalette[500],
      hover: neutralPalette[600],
      text: '#ffffff',
    },
    paletteMapping: 'neutral-500 / neutral-600',
    examples: 'Cancel, Close, Dismiss',
  },
  {
    name: 'btn-danger',
    label: 'Danger Button',
    description: 'Destructive/warning actions',
    colors: {
      normal: dangerPalette[500],
      hover: dangerPalette[600],
      text: '#ffffff',
    },
    paletteMapping: 'danger-500 / danger-600',
    examples: 'Delete, Remove, Reset',
  },
];

// For Tailwind config: convert semantic buttons to the nested color object format
export const semanticButtonsForTailwind = Object.fromEntries(
  semanticButtons.map(btn => [
    btn.name,
    btn.colors
  ])
);

// =============================================================================
// Palette metadata for UI display
// =============================================================================

export const paletteMetadata = [
  { name: 'Main', prefix: 'main', description: 'Primary brand color (Teal)' },
  { name: 'Neutral', prefix: 'neutral', description: 'Grays for text, borders, backgrounds' },
  { name: 'Danger', prefix: 'danger', description: 'Errors, destructive actions' },
  { name: 'Warning', prefix: 'warning', description: 'Warnings, caution states' },
  { name: 'Success', prefix: 'success', description: 'Success states, confirmations' },
  { name: 'Info', prefix: 'info', description: 'Informational elements' },
] as const;

export const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
