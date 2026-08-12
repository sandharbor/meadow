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
import { Graph } from '../../../../../../shared_code/types/graph';
import { API_BASE_URL } from '../../../../shared/utils/apiConfig';
import { AppConfig } from '../../../../../../shared_code/types/appConfig';
import { logger } from '../../../../shared/utils/logger';

// Hook to manage callout dismissal state (load from and persist to app config)
export function useDepthCalloutDismissal(): {
  calloutDismissed: boolean | null;
  handleDismissCallout: () => void;
} {
  const [calloutDismissed, setCalloutDismissed] = useState<boolean | null>(null); // null = loading

  useEffect(() => {
    const loadCalloutState = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/app-config`);
        if (response.ok) {
          const config: AppConfig = await response.json();
          setCalloutDismissed(config.calloutDismissals?.calloutInitialPageOutlinksDepth === true);
        } else {
          setCalloutDismissed(false);
        }
      } catch (error) {
        logger.error('Error loading callout dismissal state:', error);
        setCalloutDismissed(false);
      }
    };
    loadCalloutState();
  }, []);

  const handleDismissCallout = useCallback(async () => {
    setCalloutDismissed(true);
    try {
      await fetch(`${API_BASE_URL}/app-config/callout-dismissal/calloutInitialPageOutlinksDepth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dismissed: true }),
      });
    } catch (error) {
      logger.error('Error saving callout dismissal:', error);
    }
  }, []);

  return { calloutDismissed, handleDismissCallout };
}

// Check if the graph could expand by increasing depth.
// Only true when the site is in its initial state (only the traversal-start
// node is tracked) AND leaf nodes have outlinks outside the working graph.
// graphUpdateTrigger is needed because tracked state is applied in-place on the
// graph's nodes after config loads, without changing the graph object reference.
export function useHasFrontierOutlinks(graph: Graph, graphUpdateTrigger?: number): boolean {
  return React.useMemo(() => {
    const allNodes = graph.getAllNodes();
    if (allNodes.length === 0) return false;

    const traversalStartNode = allNodes.find(node => node.depth === 0);
    if (!traversalStartNode || !traversalStartNode.tracked) return false;

    // Check that all other nodes are not tracked (site is in initial state).
    const otherTrackedNodes = allNodes.filter(
      node => node.depth !== 0 && node.tracked
    );
    if (otherTrackedNodes.length > 0) return false;

    const workingGraphNodeKeys = new Set<string>(allNodes.map(node => node.siteNodeKey));

    // Check whether any non-frontier leaf node has outlinks outside the graph.
    const leafNodes = allNodes.filter(node => node.remaining_depth === 0 && !node.isFrontierNode);
    for (const leafNode of leafNodes) {
      const outlinks = graph.getAllOutlinkTargets(leafNode.siteNodeKey);
      for (const targetId of outlinks) {
        if (!workingGraphNodeKeys.has(targetId)) {
          return true;
        }
      }
    }

    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, graphUpdateTrigger]);
}

interface DepthCalloutProps {
  position: { x: number; y: number };
  onDismiss: () => void;
}

const DepthCallout: React.FC<DepthCalloutProps> = ({ position, onDismiss }) => {
  return (
    <div
      className="absolute z-20 pointer-events-auto"
      style={{
        left: Math.max(10, position.x + 10),
        top: Math.max(10, position.y - 20),
        maxWidth: 220,
      }}
    >
      <div className="bg-main-50 border border-main-200 rounded-lg shadow-lg p-3 relative">
        <button
          onClick={onDismiss}
          className="absolute top-1 right-1 text-main-400 hover:text-main-600 p-1"
          title="Dismiss"
        >
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 2L10 10M10 2L2 10" />
          </svg>
        </button>
        <div className="text-xs text-main-700 pr-4">
          <p className="font-medium mb-1">We started small!</p>
          <p className="text-main-600">
            We only followed the links for three hops.
          </p>
          <p className="text-main-600 mt-2">
            You can make your site bigger by selecting this page and increasing the outlink depth.
          </p>
        </div>
        {/* Arrow pointing to page */}
        <div
          className="absolute w-2 h-2 bg-main-50 border-t-2 border-l-2 border-main-400 transform -rotate-45"
          style={{
            left: -5,
            top: 16,
          }}
        />
      </div>
    </div>
  );
};

export default DepthCallout;
