/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { apiRequest } from '../../src/shared/utils/apiClient';
import { logger } from '../../src/shared/utils/logger';
import { useSensitivityReaffirmation } from '../../src/shared/app-shell/components/useSensitivityReaffirmation';

vi.mock('../../src/shared/utils/apiClient', () => ({ apiRequest: vi.fn() }));
vi.mock('../../src/shared/utils/logger', () => ({ logger: { error: vi.fn() } }));

const mockedApiRequest = vi.mocked(apiRequest);

// The browser fails a request it cancels with a generic network error.
function pendingRequest() {
  let fail!: () => void;
  mockedApiRequest.mockImplementation(() => new Promise((_, reject) => { fail = () => reject(new TypeError('Failed to fetch')); }));
  return { fail: () => act(async () => fail()) };
}

const options = { slug: 'small', enabled: true, sourcingOpen: false, onPolicyChanged: () => {} };

describe('useSensitivityReaffirmation', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('does not report a check that leaving the page cut off', async () => {
    const request = pendingRequest();
    renderHook(() => useSensitivityReaffirmation(options));
    window.dispatchEvent(new window.Event('pagehide'));
    await request.fail();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not report a check that leaving the bundle cut off', async () => {
    const request = pendingRequest();
    const { unmount } = renderHook(() => useSensitivityReaffirmation(options));
    unmount();
    await request.fail();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('reports a check that fails while the bundle stays open', async () => {
    const request = pendingRequest();
    renderHook(() => useSensitivityReaffirmation(options));
    await request.fail();
    expect(logger.error).toHaveBeenCalledWith('Could not assess changes since tracking', expect.any(TypeError));
  });
});
