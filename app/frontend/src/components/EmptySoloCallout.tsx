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

interface EmptySoloCalloutProps {
  onTurnOffSolos: () => void;
}

const EmptySoloCallout: React.FC<EmptySoloCalloutProps> = ({ onTurnOffSolos }) => {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center z-10"
      data-testid="empty-solo-callout"
    >
      <div className="bg-main-50 border border-main-200 rounded-lg shadow-lg p-4 max-w-sm text-center">
        <p className="text-sm text-main-700 mb-3">
          No pages to show. All pages are hidden because a filter is soloed.
        </p>
        <button
          onClick={onTurnOffSolos}
          className="px-3 py-1.5 text-sm bg-main-600 text-white rounded hover:bg-main-700 transition-colors"
        >
          Turn off solos
        </button>
      </div>
    </div>
  );
};

export default EmptySoloCallout;
