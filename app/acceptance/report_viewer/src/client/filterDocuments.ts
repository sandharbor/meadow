/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */
import { coreConceptIds as id } from '../../../../concepts/ids.ts'

/** Only genuine canonical counterparts; synthetic categories have no document arrow. */
export const surfaceDocumentIds: Readonly<Record<string, string>> = { browser: id.webClient, cli: id.cli }
export const sourceChangeDocumentIds: Readonly<Record<string, string>> = {
  move: id.sourceMove, rename: id.sourceMove, modify: id.sourceModification, remove: id.sourceRemoval,
}
// Starts-with values describe fixture shapes, not separate canonical documents.
