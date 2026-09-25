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

import type { appPlace, ParticipatesIn } from '../../../../../../concepts/index.js';
import type { AppPlace, PlaceNodeReference, PlaceRegistry, PlaceSurface } from '../../../../../../contracts/places/index.js';
import type {
  SelectionRequestResult,
  SurfaceOpenResult,
  SurfaceParticipant,
} from '../../places/placeContext.js';

/**
 * Tracks the place the app is at, opens places that arrive by link as deep as
 * it can, and keeps the URL and browser history to the history places. It
 * holds no React or router state so it can be tested directly.
 */

export interface PlaceCoordinatorEnvironment {
  registry: PlaceRegistry;
  /** Change the URL. `push` adds a history entry; otherwise it is replaced. */
  navigate(path: string, options: { push: boolean }): void;
  /** Go back one history entry. */
  back(): void;
  /** Publish the complete current place for tooling. */
  publish(path: string): void;
  /** Called when the page changes, so open surfaces can report again. */
  pageEntered?(): void;
  /** Called whenever the place changes, with how it was reached. */
  reached(path: string, via: 'app' | 'link'): void;
  /** Show a notice when an in-app move could not reach its whole place. */
  notify?(notice: string): void;
  /** Called once a link's arrival has settled. */
  arrived(arrival: { requested: string; reached: string; notice?: string }): void;
  /** How long to wait for a surface's owner to appear before giving up. */
  participantTimeoutMs?: number;
  setTimer?(callback: () => void, ms: number): () => void;
}

type PageOnly = { page: 'bundle-list' } | { page: 'bundle'; slug: string };

interface PendingArrival {
  requestedPath: string;
  /** Opened by the app itself rather than a link: nothing to report back. */
  inApp: boolean;
  surface?: PlaceSurface;
  select?: readonly PlaceNodeReference[];
  notices: string[];
  surfaceSettled: boolean;
  selectionSettled: boolean;
  cancelTimers: (() => void)[];
}

function samePage(a: PageOnly, b: PageOnly): boolean {
  return a.page === b.page && (a.page === 'bundle-list' || a.slug === (b as { slug: string }).slug);
}

function pageOf(place: AppPlace): PageOnly {
  return place.page === 'bundle-list' ? { page: 'bundle-list' } : { page: 'bundle', slug: place.slug };
}

export class PlaceCoordinator {
  private page: PageOnly = { page: 'bundle-list' };
  private surface: PlaceSurface | undefined;
  private selection: readonly PlaceNodeReference[] = [];
  private readonly participants = new Set<SurfaceParticipant>();
  private selectionHandler: ((references: readonly PlaceNodeReference[]) => SelectionRequestResult | Promise<SelectionRequestResult>) | undefined;
  private arrival: PendingArrival | undefined;
  /** The URL still shows the link that brought the person here. */
  private holdingLinkUrl = false;
  /** The history entry for the open history surface was pushed by the app. */
  private pushedHistorySurface = false;
  private lastReachedPath = '';
  /**
   * A surface change requested by Back/Forward. Its owner reports the change
   * later, from an effect; the URL is already right when it does.
   */
  private followingHistory: { surface: string; open: boolean } | undefined;

  constructor(private readonly environment: PlaceCoordinatorEnvironment) {}

  /** The surface a link is opening, if one is still in progress. */
  requestedSurface(): string | undefined {
    return this.arrival?.surface && !this.arrival.surfaceSettled ? this.arrival.surface.name : undefined;
  }

  current(): AppPlace {
    return this.page.page === 'bundle-list'
      ? { page: 'bundle-list', ...(this.surface && { surface: this.surface }) }
      : {
        page: 'bundle',
        slug: this.page.slug,
        ...(this.surface && { surface: this.surface }),
        ...(this.selection.length > 0 && { select: this.selection }),
      };
  }

  // ---- Locations ----

  /**
   * A location the app did not produce itself: the first load, a link, or a
   * browser Back/Forward. Links carry surfaces or selections to open.
   */
  handleLocation(path: string, options: { initial: boolean }): void {
    let parsed;
    try {
      parsed = this.environment.registry.parseAppPlace(path);
    } catch {
      return;
    }
    const target = parsed.place;
    const pageChanged = !samePage(this.page, pageOf(target));
    if (pageChanged) this.enterPage(pageOf(target));
    const isLink = options.initial || Boolean(target.surface) || (target.page === 'bundle' && Boolean(target.select?.length));
    if (!isLink) {
      // Back/Forward to a place without a surface closes a history surface.
      if (this.surface && this.isHistorySurface(this.surface.name)) {
        // The entry is already gone; closing must not navigate again.
        this.pushedHistorySurface = false;
        this.followingHistory = { surface: this.surface.name, open: false };
        this.requestSurface(this.surface.name, null);
      }
      this.publish('app');
      return;
    }
    if (!options.initial && target.surface && this.isHistorySurface(target.surface.name) && !(target.page === 'bundle' && target.select) && parsed.ignored.length === 0) {
      // Forward into a history surface is ordinary navigation, not a link.
      this.followingHistory = { surface: target.surface.name, open: true };
      this.requestSurface(target.surface.name, target.surface.parameters);
      return;
    }
    this.beginArrival(path, target, parsed.ignored);
  }

  private enterPage(page: PageOnly): void {
    this.page = page;
    this.surface = undefined;
    this.selection = [];
    this.pushedHistorySurface = false;
    this.environment.pageEntered?.();
  }

  private isHistorySurface(name: string): boolean {
    return this.environment.registry.surfaceDefinition(this.page.page, name)?.history ?? false;
  }

  // ---- Arrival ----

  private beginArrival(requestedPath: string, target: AppPlace, ignored: readonly string[], inApp = false): void {
    this.cancelArrival();
    const arrival: PendingArrival = {
      requestedPath,
      inApp,
      surface: target.surface,
      select: target.page === 'bundle' ? target.select : undefined,
      notices: ignored.length > 0 ? [`ignored ${ignored.join(', ')}`] : [],
      surfaceSettled: !target.surface,
      selectionSettled: !(target.page === 'bundle' && target.select?.length),
      cancelTimers: [],
    };
    this.arrival = arrival;
    this.holdingLinkUrl = !inApp;
    // Selection first: some surfaces, such as copying the selected pages, act on it.
    if (arrival.select) this.deliverSelection(arrival);
    else if (arrival.surface) this.deliverSurface(arrival);
    this.finishArrivalIfSettled();
  }

  private timer(callback: () => void): () => void {
    const ms = this.environment.participantTimeoutMs ?? 8_000;
    if (this.environment.setTimer) return this.environment.setTimer(callback, ms);
    const handle = setTimeout(callback, ms);
    return () => clearTimeout(handle);
  }

  private owner(surface: string): SurfaceParticipant | undefined {
    return [...this.participants].find(participant => participant.surface === surface && !participant.parameters);
  }

  private deliverSurface(arrival: PendingArrival): void {
    const surface = arrival.surface!;
    const title = this.environment.registry.surfaceDefinition(this.page.page, surface.name)?.title ?? surface.name;
    const owner = this.owner(surface.name);
    if (!owner) {
      arrival.cancelTimers.push(this.timer(() => {
        if (this.arrival !== arrival || arrival.surfaceSettled) return;
        arrival.notices.push(`${title} couldn't open: it isn't available here`);
        arrival.surfaceSettled = true;
        this.finishArrivalIfSettled();
      }));
      return;
    }
    const registry = this.environment.registry;
    const ownParameters = Object.fromEntries(Object.entries(surface.parameters).filter(([name]) => registry.isOwnParameter(this.page.page, surface.name, name)));
    void Promise.resolve(owner.onRequest(ownParameters)).then(result => {
      if (this.arrival !== arrival) return;
      if (result !== true) {
        arrival.notices.push(`${title} couldn't open: ${result}`);
        arrival.surfaceSettled = true;
        this.finishArrivalIfSettled();
        return;
      }
      // The owner reports the open surface from an effect; record it now.
      this.surface = { name: surface.name, parameters: ownParameters };
      this.deliverExtensions(arrival, title);
    });
  }

  /** Parameters owned by other areas open once their surface is open. */
  private deliverExtensions(arrival: PendingArrival, title: string): void {
    const surface = arrival.surface!;
    const registry = this.environment.registry;
    const pending = new Map(Object.entries(surface.parameters).filter(([name]) => !registry.isOwnParameter(this.page.page, surface.name, name)));
    const settleIfDone = () => {
      if (pending.size > 0 || this.arrival !== arrival) return;
      arrival.surfaceSettled = true;
      this.finishArrivalIfSettled();
    };
    const tryDeliver = () => {
      for (const participant of this.participants) {
        if (participant.surface !== surface.name) continue;
        const names = participant.parameters ?? [];
        const values = Object.fromEntries(names.filter(name => pending.has(name)).map(name => [name, pending.get(name)!]));
        if (Object.keys(values).length === 0) continue;
        for (const name of Object.keys(values)) pending.delete(name);
        void Promise.resolve(participant.onRequest(values)).then(result => {
          if (this.arrival !== arrival) return;
          if (result !== true) arrival.notices.push(`${title} ${Object.values(values).join(' ')} couldn't open: ${result}`);
          else if (this.surface?.name === surface.name) this.surface = { name: surface.name, parameters: { ...this.surface.parameters, ...values } };
          settleIfDone();
        });
      }
    };
    tryDeliver();
    if (pending.size === 0) {
      settleIfDone();
      return;
    }
    // Extension participants mount inside the surface; retry as they register.
    this.retryExtensions = tryDeliver;
    arrival.cancelTimers.push(this.timer(() => {
      if (this.arrival !== arrival || pending.size === 0) return;
      arrival.notices.push(`${title} ${[...pending.values()].join(' ')} couldn't open: it isn't available here`);
      pending.clear();
      this.retryExtensions = undefined;
      settleIfDone();
    }));
  }

  private retryExtensions: (() => void) | undefined;

  private deliverSelection(arrival: PendingArrival): void {
    const handler = this.selectionHandler;
    if (!handler) {
      arrival.cancelTimers.push(this.timer(() => {
        if (this.arrival !== arrival || arrival.selectionSettled) return;
        arrival.notices.push('the selected pages couldn\'t be shown here');
        arrival.selectionSettled = true;
        if (arrival.surface && !arrival.surfaceSettled) this.deliverSurface(arrival);
        this.finishArrivalIfSettled();
      }));
      return;
    }
    void Promise.resolve(handler(arrival.select!)).then(result => {
      if (this.arrival !== arrival) return;
      if (result.missing > 0) {
        const total = arrival.select!.length;
        arrival.notices.push(`${result.missing} of ${total} selected page${total === 1 ? '' : 's'} no longer exist${result.missing === 1 ? 's' : ''}`);
      }
      this.selection = result.selected;
      arrival.selectionSettled = true;
      if (arrival.surface && !arrival.surfaceSettled) this.deliverSurface(arrival);
      this.finishArrivalIfSettled();
    });
  }

  private finishArrivalIfSettled(): void {
    const arrival = this.arrival;
    if (!arrival || !arrival.surfaceSettled || !arrival.selectionSettled) return;
    arrival.cancelTimers.forEach(cancel => cancel());
    this.arrival = undefined;
    this.retryExtensions = undefined;
    const reached = this.environment.registry.appPlacePath(this.current());
    const opened = this.environment.registry.describeAppPlace(this.current());
    const notice = arrival.notices.length > 0 ? `Opened ${opened}, but ${arrival.notices.join('; ')}.` : undefined;
    this.environment.publish(reached);
    this.lastReachedPath = this.pathWithoutSelection();
    this.environment.reached(this.lastReachedPath, arrival.inApp ? 'app' : 'link');
    if (arrival.inApp) {
      if (notice) this.environment.notify?.(notice);
      return;
    }
    this.environment.arrived({ requested: arrival.requestedPath, reached, ...(notice && { notice }) });
  }

  private cancelArrival(): void {
    this.arrival?.cancelTimers.forEach(cancel => cancel());
    this.arrival = undefined;
    this.retryExtensions = undefined;
  }

  // ---- Participants ----

  registerSurface(participant: SurfaceParticipant): () => void {
    this.participants.add(participant);
    const arrival = this.arrival;
    if (arrival?.surface?.name === participant.surface && !arrival.surfaceSettled && arrival.selectionSettled) {
      if (!participant.parameters && !this.surface) this.deliverSurface(arrival);
      else this.retryExtensions?.();
    }
    return () => { this.participants.delete(participant); };
  }

  registerSelection(handler: (references: readonly PlaceNodeReference[]) => SelectionRequestResult | Promise<SelectionRequestResult>): () => void {
    this.selectionHandler = handler;
    const arrival = this.arrival;
    if (arrival?.select && !arrival.selectionSettled) this.deliverSelection(arrival);
    return () => { if (this.selectionHandler === handler) this.selectionHandler = undefined; };
  }

  private requestSurface(name: string, parameters: Readonly<Record<string, string>> | null): void {
    const owner = this.owner(name);
    if (owner) void owner.onRequest(parameters);
  }

  // ---- Reports from the app ----

  reportSurface(name: string, owned: readonly string[] | undefined, open: boolean, parameters: Readonly<Record<string, string>>): void {
    // A component of the page being left may still report as it unmounts.
    if (!this.environment.registry.surfaceDefinition(this.page.page, name)) return;
    const previous = this.surface;
    if (!owned) {
      // The owner opened, changed, or closed its surface. Closing a surface
      // that is no longer current (another one replaced it) changes nothing.
      if (!open && this.surface?.name !== name) return;
      this.surface = open ? { name, parameters: { ...this.extensionParameters(name), ...parameters } } : undefined;
    } else if (this.surface?.name === name) {
      const kept = Object.fromEntries(Object.entries(this.surface.parameters).filter(([key]) => !owned.includes(key)));
      this.surface = { name, parameters: open ? { ...kept, ...parameters } : kept };
    } else return;
    this.afterAppChange(previous);
  }

  private extensionParameters(name: string): Record<string, string> {
    if (this.surface?.name !== name) return {};
    const registry = this.environment.registry;
    return Object.fromEntries(Object.entries(this.surface.parameters).filter(([key]) => !registry.isOwnParameter(this.page.page, name, key)));
  }

  reportSelection(references: readonly PlaceNodeReference[]): void {
    const unchanged = references.length === this.selection.length
      && references.every((reference, index) => JSON.stringify(reference) === JSON.stringify(this.selection[index]));
    if (unchanged) return;
    this.selection = references;
    this.afterAppChange(this.surface);
  }

  /**
   * The app moves the person to a place, for example after renaming a bundle
   * or from "Find in bundles". Page changes push history like any navigation.
   */
  openInApp(place: AppPlace): void {
    const page = pageOf(place);
    if (!samePage(this.page, page)) {
      this.cancelArrival();
      this.environment.navigate(this.environment.registry.appPlacePath(page), { push: true });
      this.enterPage(page);
      this.holdingLinkUrl = false;
      this.publish('app');
    }
    if (place.surface || (place.page === 'bundle' && place.select?.length)) {
      this.beginArrival(this.environment.registry.appPlacePath(place), place, [], true);
    }
  }

  /** The page itself changed through in-app navigation. */
  reportPage(page: PageOnly): void {
    if (samePage(this.page, page)) return;
    this.cancelArrival();
    this.enterPage(page);
    this.holdingLinkUrl = false;
    this.publish('app');
  }

  private afterAppChange(previous: PlaceSurface | undefined): void {
    if (this.arrival) {
      // Changes while a link is still opening are part of its arrival.
      this.environment.publish(this.environment.registry.appPlacePath(this.current()));
      return;
    }
    const wasHistory = previous ? this.isHistorySurface(previous.name) : false;
    const isHistory = this.surface ? this.isHistorySurface(this.surface.name) : false;
    const projection = this.environment.registry.appPlacePath(this.projection());
    const expected = this.followingHistory;
    const followsHistory = expected !== undefined
      && (expected.open ? this.surface?.name === expected.surface : previous?.name === expected.surface && this.surface?.name !== expected.surface);
    if (followsHistory) {
      this.followingHistory = undefined;
      this.pushedHistorySurface = isHistory;
    } else if (this.holdingLinkUrl) {
      // The person moved on from the link; keep only its history place.
      this.holdingLinkUrl = false;
      this.environment.navigate(projection, { push: false });
    } else if (isHistory && (!previous || previous.name !== this.surface!.name)) {
      this.environment.navigate(projection, { push: true });
      this.pushedHistorySurface = true;
    } else if (wasHistory && !isHistory && this.pushedHistorySurface) {
      this.pushedHistorySurface = false;
      this.environment.back();
    } else if (isHistory || wasHistory) {
      this.environment.navigate(projection, { push: false });
    }
    this.publish('app');
  }

  private pathWithoutSelection(): string {
    return this.environment.registry.appPlacePath(
      this.page.page === 'bundle' ? { page: 'bundle', slug: this.page.slug, ...(this.surface && { surface: this.surface }) } : this.current(),
    );
  }

  /** What the URL shows: the page and any open history surface. */
  private projection(): AppPlace {
    const surface = this.surface && this.isHistorySurface(this.surface.name) ? this.surface : undefined;
    return this.page.page === 'bundle-list'
      ? { page: 'bundle-list', ...(surface && { surface }) }
      : { page: 'bundle', slug: this.page.slug, ...(surface && { surface }) };
  }

  private publish(via: 'app' | 'link'): void {
    const path = this.environment.registry.appPlacePath(this.current());
    this.environment.publish(path);
    // Coverage counts surfaces and pages; selection-only changes are not logged.
    const withoutSelection = this.pathWithoutSelection();
    if (withoutSelection !== this.lastReachedPath) {
      this.lastReachedPath = withoutSelection;
      this.environment.reached(withoutSelection, via);
    }
  }
}

export type { SurfaceOpenResult };

export type AppPlaceCoordinatorMeadowConceptParticipations = [
  ParticipatesIn<typeof appPlace, "publish-and-arrive", typeof PlaceCoordinator>,
];
