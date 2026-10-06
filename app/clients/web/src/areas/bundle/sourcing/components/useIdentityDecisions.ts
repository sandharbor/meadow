/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { useCallback, useRef, useState } from 'react';

type Choices = Record<string, string | null>;
type Pending = Record<string, { value: string | null; version: number }>;

/** Show choices immediately; serialize writes against the latest proposal revision. */
export function useIdentityDecisions(confirmed: Choices, save: (choices: Choices) => Promise<unknown>, reportError: (error: unknown) => void) {
  const callbacks = useRef({ save, reportError });
  callbacks.current = { save, reportError };
  const pendingRef = useRef<Pending>({});
  const version = useRef(0);
  const running = useRef(false);
  const [pending, setPending] = useState<Pending>({});
  const [saving, setSaving] = useState(false);
  const choose = useCallback((choices: Choices) => {
    for (const [id, value] of Object.entries(choices)) pendingRef.current[id] = { value, version: ++version.current };
    setPending({ ...pendingRef.current });
    if (running.current) return;
    running.current = true; setSaving(true);
    void (async () => {
      try {
        while (Object.keys(pendingRef.current).length) {
          const batch = { ...pendingRef.current };
          try { await callbacks.current.save(Object.fromEntries(Object.entries(batch).map(([id, decision]) => [id, decision.value]))); }
          catch (error) { callbacks.current.reportError(error); }
          // A later click on the same page remains queued, even if this write failed.
          for (const [id, decision] of Object.entries(batch)) {
            if (pendingRef.current[id]?.version === decision.version) delete pendingRef.current[id];
          }
          setPending({ ...pendingRef.current });
        }
      } finally { running.current = false; setSaving(false); }
    })();
  }, []);
  return { choices: { ...confirmed, ...Object.fromEntries(Object.entries(pending).map(([id, decision]) => [id, decision.value])) }, saving, choose };
}
