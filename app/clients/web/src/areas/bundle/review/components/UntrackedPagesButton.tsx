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

interface UntrackedPagesButtonProps {
  untrackedCount: number;
  onClick: () => void;
  showActionLink?: boolean;
}

export function UntrackedPagesButton({ untrackedCount, onClick, showActionLink = false }: UntrackedPagesButtonProps) {
  if (untrackedCount <= 0) {
    return null;
  }

  if (showActionLink) {
    return (
      <div className="px-4 py-2 bg-warning-50 text-warning-700 text-sm rounded border border-warning-300 flex items-center space-x-1">
        <span className="text-warning-600">&#9888;&#65039;</span>
        <span>
          Hey, there {untrackedCount === 1 ? 'is' : 'are'} {untrackedCount} untracked page{untrackedCount === 1 ? '' : 's'}!
        </span>
        <button
          onClick={onClick}
          className="text-warning-800 underline hover:text-warning-900 font-medium"
        >
          Check {untrackedCount === 1 ? 'it' : 'them'}.
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className="px-3 py-1 bg-warning-50 hover:bg-warning-100 text-warning-700 text-sm rounded border border-warning-300 transition-colors duration-200 flex items-center space-x-2"
      title="Click to view untracked pages"
    >
      <span className="text-warning-600">&#9888;&#65039;</span>
      <span>
        {untrackedCount} untracked page{untrackedCount === 1 ? '' : 's'}
      </span>
    </button>
  );
}
