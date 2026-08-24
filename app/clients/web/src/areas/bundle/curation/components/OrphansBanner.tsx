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

interface OrphansBannerProps {
  orphanCount: number;
  onReview: () => void;
}

export function OrphansBanner({ orphanCount, onReview }: OrphansBannerProps) {
  if (orphanCount <= 0) {
    return null;
  }

  return (
    <div
      className="px-4 py-2 bg-warning-50 text-warning-700 text-sm border-b border-warning-200 flex items-center justify-between gap-4"
      data-testid="orphans-banner"
    >
      <div className="flex items-center space-x-1 min-w-0">
        <span className="text-warning-600 flex-shrink-0">&#9888;&#65039;</span>
        <span data-testid="orphans-banner-count">
          {orphanCount} {orphanCount === 1 ? 'page' : 'pages'} in your bundle config{' '}
          {orphanCount === 1 ? 'is' : 'are'} no longer reachable in the graph.
        </span>
      </div>
      <button
        onClick={onReview}
        className="text-warning-800 underline hover:text-warning-900 font-medium flex-shrink-0"
        data-testid="review-orphans-button"
      >
        Review orphaned pages
      </button>
    </div>
  );
}
