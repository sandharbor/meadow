/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

/**
 * App places are screens a person can be sent to: a page, optionally one
 * surface (a dialog or panel) with its step or tab, and a node selection.
 * Each app area declares the surfaces it owns with these pure, React-free
 * definitions; contracts/places/index.ts gathers them for every caller.
 */

export type PlacePage = 'bundle-list' | 'bundle';

export interface PlaceParameterDefinition {
  /** Short query parameter name, unique among one page's surfaces unless shared with the same meaning. */
  name: string;
  description: string;
  /** Allowed values; omitted for identifiers such as a node key or request ID. */
  values?: readonly string[];
  required?: boolean;
}

export interface PlaceSurfaceDefinition {
  /** The `surface` query value. */
  surface: string;
  page: PlacePage;
  /** Human label used in notices, help, and reports, such as "Source review". */
  title: string;
  /**
   * The dialog's accessible name, so a checkpoint can tell an addressable
   * surface from one that escaped the place system. Omitted for surfaces that
   * change the page without opening a dialog.
   */
  dialogName?: string | RegExp;
  /** Entering it in the app updates the URL and pushes browser history. */
  history: boolean;
  parameters: readonly PlaceParameterDefinition[];
}

/** A dialog that is never linked, with the reason recorded where it is owned. */
export interface TransientDialogDefinition {
  dialogName: string | RegExp;
  reason: string;
}

/**
 * Parameters an owner contributes to another owner's surface, for dialogs it
 * renders inside that surface (one surface is open at a time).
 */
export interface PlaceSurfaceExtension {
  page: PlacePage;
  surface: string;
  parameters: readonly PlaceParameterDefinition[];
  /** Dialogs these parameters open, so checkpoints recognize them. */
  dialogNames: readonly (string | RegExp)[];
}

export interface PlaceOwnerDefinition {
  /** The owning area or shared folder, as the boundary checker names it. */
  owner: string;
  surfaces: readonly PlaceSurfaceDefinition[];
  extensions?: readonly PlaceSurfaceExtension[];
  transients?: readonly TransientDialogDefinition[];
}

/** A selected node by durable ID when it has one, otherwise by source locator. */
export type PlaceNodeReference = { id: string } | { key: string };

export interface PlaceSurface {
  name: string;
  parameters: Readonly<Record<string, string>>;
}

export type AppPlace =
  | { page: 'bundle-list'; surface?: PlaceSurface }
  | { page: 'bundle'; slug: string; surface?: PlaceSurface; select?: readonly PlaceNodeReference[] };

/** What a link asked for and what the app actually reached, as reported to the Runtime. */
export interface PlaceArrival {
  requested: string;
  reached: string;
  /** Why the app stopped short of the requested place, when it did. */
  notice?: string;
  arrivedAt: string;
}
