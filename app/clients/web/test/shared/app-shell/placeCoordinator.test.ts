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

import { describe, expect, it } from 'vitest';
import { placeRegistry } from '../../../../../contracts/places/index';
import { PlaceCoordinator } from '../../../src/shared/app-shell/places/placeCoordinator';

function harness() {
  const events: string[] = [];
  const arrivals: { requested: string; reached: string; notice?: string }[] = [];
  const timers: (() => void)[] = [];
  const coordinator = new PlaceCoordinator({
    registry: placeRegistry,
    navigate: (path, { push }) => events.push(`${push ? 'push' : 'replace'} ${path}`),
    back: () => events.push('back'),
    publish: path => events.push(`publish ${path}`),
    reached: (path, via) => events.push(`reached ${path} via ${via}`),
    arrived: arrival => arrivals.push(arrival),
    setTimer: callback => { timers.push(callback); return () => undefined; },
  });
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  return { coordinator, events, arrivals, fireTimers: () => timers.splice(0).forEach(timer => timer()), flush };
}

describe('PlaceCoordinator', () => {
  it('opens a linked surface, its extension parameters, and the selection, then reports what was reached', async () => {
    const { coordinator, events, arrivals, flush } = harness();
    const opened: unknown[] = [];
    coordinator.handleLocation('/bundle/big?surface=preview&step=share&settings=okf&select=id:a,key:%2Fgone.md', { initial: true });
    coordinator.registerSelection(references => ({ selected: references.filter(reference => 'id' in reference), missing: 1 }));
    coordinator.registerSurface({ surface: 'preview', onRequest: parameters => { opened.push(parameters); return true; } });
    await flush();
    coordinator.registerSurface({ surface: 'preview', parameters: ['settings'], onRequest: parameters => { opened.push(parameters); return true; } });
    await flush();
    expect(opened).toEqual([{ step: 'share' }, { settings: 'okf' }]);
    expect(arrivals).toEqual([{
      requested: '/bundle/big?surface=preview&step=share&settings=okf&select=id:a,key:%2Fgone.md',
      reached: '/bundle/big?surface=preview&step=share&settings=okf&select=id:a',
      notice: 'Opened big › Preview › share › okf › 1 selected, but 1 of 2 selected pages no longer exists.',
    }]);
    expect(events).toContain('reached /bundle/big?surface=preview&step=share&settings=okf via link');
  });

  it('opens as deep as it can when a surface refuses or never appears', async () => {
    const { coordinator, arrivals, fireTimers, flush } = harness();
    coordinator.handleLocation('/bundle/big?surface=source-review', { initial: true });
    coordinator.registerSurface({ surface: 'source-review', onRequest: () => 'no source changes to review' });
    await flush();
    expect(arrivals.at(-1)).toEqual({
      requested: '/bundle/big?surface=source-review',
      reached: '/bundle/big',
      notice: "Opened big, but Source review couldn't open: no source changes to review.",
    });
    coordinator.handleLocation('/bundle/other?surface=source-snapshots', { initial: false });
    fireTimers();
    expect(arrivals.at(-1)?.notice).toBe("Opened other, but Source snapshots couldn't open: it isn't available here.");
  });

  it('ignores a surface the page being left reports after moving on', () => {
    const { coordinator, events } = harness();
    coordinator.handleLocation('/', { initial: false });
    coordinator.reportSurface('find', undefined, true, { vault: '/v', folder: '', page: 'p' });
    coordinator.openInApp({ page: 'bundle', slug: 'big' });
    coordinator.reportSurface('find', undefined, true, { vault: '/v', folder: '', page: 'p' });
    expect(coordinator.current()).toEqual({ page: 'bundle', slug: 'big' });
    expect(events.at(-1)).toBe('reached /bundle/big via app');
  });

  it('keeps history places in the URL and leaves other surfaces out of it', () => {
    const { coordinator, events } = harness();
    coordinator.handleLocation('/bundle/big', { initial: false });
    events.length = 0;
    coordinator.reportSurface('manage-sources', undefined, true, {});
    coordinator.reportSurface('manage-sources', undefined, false, {});
    expect(events.filter(event => event.startsWith('push') || event.startsWith('replace') || event === 'back')).toEqual([]);
    coordinator.reportSurface('preview', undefined, true, { step: 'review' });
    coordinator.reportSurface('preview', undefined, true, { step: 'share' });
    coordinator.reportSurface('preview', undefined, false, {});
    expect(events.filter(event => event.startsWith('push') || event.startsWith('replace') || event === 'back')).toEqual([
      'push /bundle/big?surface=preview&step=review',
      'replace /bundle/big?surface=preview&step=share',
      'back',
    ]);
    expect(events).toContain('reached /bundle/big?surface=manage-sources via app');
  });

  it('follows Back and Forward without adding history entries', async () => {
    const { coordinator, events, flush } = harness();
    let open = false;
    coordinator.handleLocation('/bundle/big', { initial: false });
    coordinator.registerSurface({
      surface: 'preview',
      onRequest: parameters => {
        open = parameters !== null;
        // Owners report from effects, after the request returns.
        setTimeout(() => coordinator.reportSurface('preview', undefined, open, parameters ?? {}), 0);
        return true;
      },
    });
    coordinator.reportSurface('preview', undefined, true, { step: 'review' });
    events.length = 0;
    coordinator.handleLocation('/bundle/big', { initial: false });
    await flush();
    coordinator.handleLocation('/bundle/big?surface=preview&step=review', { initial: false });
    await flush();
    expect(open).toBe(true);
    expect(events.filter(event => event.startsWith('push') || event === 'back')).toEqual([]);
  });

  it('drops a linked non-history surface from the URL once the person moves on', async () => {
    const { coordinator, events, flush } = harness();
    coordinator.registerSurface({ surface: 'manage-sources', onRequest: () => true });
    coordinator.handleLocation('/bundle/big?surface=manage-sources', { initial: true });
    await flush();
    events.length = 0;
    coordinator.reportSurface('manage-sources', undefined, false, {});
    expect(events).toContain('replace /bundle/big');
  });
});
