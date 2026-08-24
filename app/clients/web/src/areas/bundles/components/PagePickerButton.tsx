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

interface PagePickerButtonProps {
  page: { title: string; directory: string };
  onSelect: () => void;
  highlightQuery?: string;
}

function titleHighlightParts(title: string, query: string): Array<{ text: string; isMatch: boolean }> {
  const parts = query.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [{ text: title, isMatch: false }];

  const titleLower = title.toLowerCase();
  const ranges: Array<{ start: number; end: number }> = [];
  for (const part of parts) {
    const needle = part.toLowerCase();
    let from = 0;
    while (from < titleLower.length) {
      const index = titleLower.indexOf(needle, from);
      if (index === -1) break;
      ranges.push({ start: index, end: index + needle.length });
      from = index + Math.max(1, needle.length);
    }
  }
  if (ranges.length === 0) return [{ text: title, isMatch: false }];

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (!previous || range.start > previous.end) merged.push({ ...range });
    else previous.end = Math.max(previous.end, range.end);
  }

  const result: Array<{ text: string; isMatch: boolean }> = [];
  let cursor = 0;
  for (const range of merged) {
    if (cursor < range.start) result.push({ text: title.slice(cursor, range.start), isMatch: false });
    result.push({ text: title.slice(range.start, range.end), isMatch: true });
    cursor = range.end;
  }
  if (cursor < title.length) result.push({ text: title.slice(cursor), isMatch: false });
  return result;
}

const PagePickerButton: React.FC<PagePickerButtonProps> = ({ page, onSelect, highlightQuery = '' }) => {
  const titleParts = titleHighlightParts(page.title, highlightQuery);
  return (
    <button
      type="button"
      onMouseDown={event => event.preventDefault()}
      onClick={onSelect}
      className="w-full text-left p-2 bg-white border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 transition-colors"
    >
      <div className="font-medium text-gray-900">
        {titleParts.map((part, index) => part.isMatch ? (
          <span key={index} className="bg-yellow-200 rounded px-0.5">{part.text}</span>
        ) : (
          <span key={index}>{part.text}</span>
        ))}
      </div>
      <div className="text-xs text-gray-500">{page.directory || '(root)'}</div>
    </button>
  );
};

export default PagePickerButton;
