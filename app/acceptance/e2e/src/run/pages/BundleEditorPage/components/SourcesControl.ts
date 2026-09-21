/* Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0. */

import type { Page, Expect } from '@playwright/test';

/** Source registration and repair share the same bundle-scoped review flow. */
export class SourcesControl {
  constructor(private page: Page, private expect: Expect) {}

  private get dialog() { return this.page.getByRole('dialog', { name: /^(Manage|Review) sources$/ }); }
  private get notice() { return this.page.getByTestId('missing-source-callout'); }

  async open() {
    await this.page.getByTitle('Bundle options', { exact: true }).click();
    await this.page.getByRole('button', { name: 'Manage sources…', exact: true }).click();
    await this.expect(this.dialog).toBeVisible();
    await this.expect(this.dialog.getByRole('button', { name: 'Review source changes', exact: true })).toBeEnabled();
  }

  async expectNotice(names: string[] = []) {
    if (!names.length) await this.expect(this.notice).not.toBeVisible();
    else {
      await this.expect(this.notice).toBeVisible();
      for (const name of names) await this.expect(this.notice).toContainText(name);
    }
  }

  async reviewMissing() {
    await this.notice.getByRole('button', { name: 'Review sources', exact: true }).click();
    await this.expect(this.dialog).toBeVisible();
  }

  async expectReferences(name: string, referringPages: string[]) {
    const group = this.dialog.getByTestId(`source-reference-${name}`);
    await this.expect(group).toBeVisible();
    for (const page of referringPages) await this.expect(group).toContainText(page);
  }

  async addReferencedSource(name: string, directory: string) {
    await this.dialog.getByTestId(`source-reference-${name}`).getByRole('button', { name: 'Add source', exact: true }).click();
    await this.setDirectory(name, directory);
  }

  async setDirectory(name: string, directory: string) {
    await this.dialog.getByRole('textbox', { name: `Directory for ${name}`, exact: true }).fill(directory);
  }

  async rename(name: string, replacement: string) {
    await this.dialog.getByRole('textbox', { name: `Source name ${name}`, exact: true }).fill(replacement);
  }

  async remove(sourceId: string) {
    await this.dialog.getByTestId(`source-${sourceId}`).getByRole('button', { name: 'Remove source', exact: true }).click();
  }

  async editStartingSelections() {
    await this.dialog.getByRole('button', { name: 'Edit starting selections', exact: true }).click();
  }

  async addStartingSelection() {
    await this.dialog.getByRole('button', { name: 'Add starting selection', exact: true }).click();
  }

  async setStartingSelection(index: number, source: string, kind: 'file' | 'folder', path: string) {
    await this.dialog.getByRole('combobox', { name: `Source for starting selection ${index}`, exact: true }).selectOption({ label: source });
    await this.dialog.getByRole('combobox', { name: `Kind for starting selection ${index}`, exact: true }).selectOption(kind);
    await this.dialog.getByRole('textbox', { name: `Path for starting selection ${index}`, exact: true }).fill(path);
  }

  async stage() {
    await this.dialog.getByRole('button', { name: 'Review source changes', exact: true }).click();
    await this.expect(this.page.getByRole('dialog', { name: 'Source changes', exact: true })).toBeVisible();
  }

  async setIgnored(name: string, ignored: boolean) {
    await this.dialog.getByTestId(`source-reference-${name}`).getByRole('button', { name: ignored ? 'Ignore for this bundle' : 'Reconsider', exact: true }).click();
    await this.expect(this.dialog.getByTestId(`source-reference-${name}`).getByRole('button', { name: ignored ? 'Reconsider' : 'Ignore for this bundle', exact: true })).toBeEnabled();
  }

  async expectDisconnected(sourceId: string) {
    await this.expect(this.dialog.getByTestId(`source-${sourceId}`)).toContainText('Disconnected. Captured pages remain available.');
  }

  async close() {
    await this.dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await this.expect(this.dialog).not.toBeVisible();
  }
}
