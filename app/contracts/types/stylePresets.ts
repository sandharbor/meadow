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

export interface PresetPreviewStyles {
  fontFamily: string;      // e.g., "Source Serif Pro, Georgia, serif"
  backgroundColor: string; // e.g., "#fffef8"
  textColor: string;       // e.g., "#333"
  linkColor: string;       // e.g., "#3f80b0"
  codeBackground: string;  // e.g., "#f1f1f1"
}

export interface StylePreset {
  id: string;              // 'classic' | 'modern' | 'minimal'
  name: string;            // Display name
  description: string;     // Brief description for UI
  cssFile: string;         // Path relative to presets dir
  jsFile?: string;         // Optional JS file
  fonts: string[];         // Font family names used
  preview: PresetPreviewStyles; // For CSS-only preview cards in UI
}
