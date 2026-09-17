/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import ProgressStatus from '../../../../shared/components/ProgressStatus.js';

type GenerationProgressProps = {
  progress: {
    stage: string;
    message: string;
    progress?: { current: number; total: number; percent: number };
  } | null;
};

export function GenerationProgress({ progress }: GenerationProgressProps) {
  if (!progress || progress.stage === 'complete' || progress.stage === 'error') return null;
  const pages = typeof progress.progress?.total === 'number' ? progress.progress : undefined;
  return (
    <ProgressStatus
      message={progress.message || 'Working...'}
      percent={pages?.percent}
      rightText={pages ? `${pages.current}/${pages.total} pages` : undefined}
    />
  );
}
