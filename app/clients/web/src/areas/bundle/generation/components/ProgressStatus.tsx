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

export type ProgressStatusProps = {
  message: string;
  /**
   * 0-100. When omitted, progress bar is hidden (spinner-only).
   */
  percent?: number;
  /**
   * Optional right-side text, e.g. "12/340 files" or "120/900 pages"
   */
  rightText?: string;
  showSpinner?: boolean;
};

const clampPercent = (percent: number) => Math.max(0, Math.min(100, percent));

const BAR_WIDTH_PX = 128; // w-32 = 8rem = 128px

const ProgressStatus: React.FC<ProgressStatusProps> = ({
  message,
  percent,
  rightText,
  showSpinner = true,
}) => {
  const normalizedPercent = typeof percent === 'number' ? clampPercent(percent) : undefined;
  const completedWidthPx = typeof normalizedPercent === 'number'
    ? Math.round((normalizedPercent / 100) * BAR_WIDTH_PX)
    : 0;

  return (
    <div className="text-sm text-neutral-500">
      <div className="flex items-center space-x-3">
        {showSpinner && (
          <span className="animate-spin h-4 w-4 border-2 border-neutral-300 border-t-main-500 rounded-full inline-block" />
        )}
        <span>{message}</span>
      </div>
      {typeof normalizedPercent === 'number' && (
        <div className="flex items-center space-x-2 mt-1 ml-7">
          <div
            className="h-1.5 bg-neutral-200 rounded-full overflow-hidden"
            style={{ width: `${BAR_WIDTH_PX}px` }}
          >
            <div
              className="h-1.5 bg-main-500"
              style={{ width: `${completedWidthPx}px` }}
            />
          </div>
          {rightText && <span className="text-xs text-neutral-400">{rightText}</span>}
        </div>
      )}
    </div>
  );
};

export default ProgressStatus;


