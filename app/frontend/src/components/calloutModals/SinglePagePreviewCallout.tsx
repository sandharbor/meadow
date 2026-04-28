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
import Modal from '../Modal';
import { API_BASE_URL } from '../../utils/apiConfig';
import { logger } from '../../utils/logger';

export function useSinglePagePreviewCallout(): {
  dismissed: boolean | null;
  setDismissed: (value: boolean) => void;
} {
  const [dismissed, setDismissedState] = useState<boolean | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/app-config`);
        if (res.ok) {
          const cfg = await res.json();
          setDismissedState(cfg.calloutDismissals?.calloutPreviewSinglePage === true);
        } else {
          setDismissedState(false);
        }
      } catch {
        setDismissedState(false);
      }
    };
    load();
  }, []);

  const setDismissed = useCallback((value: boolean) => {
    setDismissedState(value);
    if (value) {
      fetch(`${API_BASE_URL}/app-config/callout-dismissal/calloutPreviewSinglePage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dismissed: true }),
      }).catch(err => logger.error('Failed to save callout dismissal:', err));
    }
  }, []);

  return { dismissed, setDismissed };
}

interface SinglePagePreviewCalloutProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
}

const SinglePagePreviewCallout: React.FC<SinglePagePreviewCalloutProps> = ({
  isOpen,
  onClose,
  onContinue,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Only one page is tracked"
      className="w-[500px]"
      showCloseButton={false}
    >
      <div className="space-y-4">
        <div className="text-sm text-gray-600">
          <p>
            Preview will only show that page and all the links will appear as not tracked.
          </p>
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-btn-confirm-text rounded bg-btn-confirm-normal hover:bg-btn-confirm-hover"
          >
            Track more
          </button>
          <button
            onClick={onContinue}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
          >
            Preview
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default SinglePagePreviewCallout;
