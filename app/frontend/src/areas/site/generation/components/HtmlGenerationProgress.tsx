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
import ProgressStatus from './ProgressStatus';

function formatUploadBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export type HtmlGenerationProgressProps = {
  isPublishing: boolean;
  isRegeneratingPreview: boolean;
  publishProgress: {
    stage: string;
    message: string;
    uploadProgress?: {
      filesUploaded: number;
      totalFiles: number;
      percentComplete: number;
      currentFileSize?: number;
      currentFileBytesUploaded?: number;
      currentFilePercentComplete?: number;
      currentFileKind?: 'regular' | 'markdown-export-manifest' | 'markdown-export-zip';
    };
  } | null;
  previewProgress: {
    stage: string;
    message: string;
    progress?: { current: number; total: number; percent: number };
    result?: { success: boolean; traversalPageUrl?: string; error?: string };
  } | null;
};

const HtmlGenerationProgress: React.FC<HtmlGenerationProgressProps> = ({
  isPublishing,
  isRegeneratingPreview: _isRegeneratingPreview,
  publishProgress,
  previewProgress,
}) => {
  const message = isPublishing
    ? (publishProgress?.message || 'Working...')
    : (previewProgress?.message || 'Working...');

  const percent = isPublishing
    ? publishProgress?.uploadProgress?.currentFileKind === 'markdown-export-zip'
      ? publishProgress.uploadProgress.currentFilePercentComplete
      : publishProgress?.uploadProgress?.totalFiles
      ? publishProgress.uploadProgress.percentComplete
      : undefined
    : typeof previewProgress?.progress?.total === 'number'
      ? previewProgress.progress.percent
      : undefined;

  const rightText = isPublishing
    ? publishProgress?.uploadProgress?.currentFileKind === 'markdown-export-zip'
      ? typeof publishProgress.uploadProgress.currentFileSize === 'number' &&
        typeof publishProgress.uploadProgress.currentFileBytesUploaded === 'number'
        ? `${formatUploadBytes(publishProgress.uploadProgress.currentFileBytesUploaded)} / ${formatUploadBytes(publishProgress.uploadProgress.currentFileSize)}`
        : undefined
      : publishProgress?.uploadProgress?.totalFiles
      ? `${publishProgress.uploadProgress.filesUploaded}/${publishProgress.uploadProgress.totalFiles} files`
      : undefined
    : typeof previewProgress?.progress?.total === 'number'
      ? `${previewProgress.progress.current}/${previewProgress.progress.total} pages`
      : undefined;

  const hasActiveProgress =
    (publishProgress !== null && publishProgress.stage !== 'complete' && publishProgress.stage !== 'error') ||
    (previewProgress !== null && previewProgress.stage !== 'complete' && previewProgress.stage !== 'error');

  if (!hasActiveProgress) {
    return null;
  }

  return (
    <ProgressStatus
      message={message}
      percent={percent}
      rightText={rightText}
    />
  );
};

export default HtmlGenerationProgress;
