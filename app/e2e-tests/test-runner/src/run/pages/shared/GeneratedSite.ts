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

import type {
  Download,
  Expect,
  FrameLocator,
  Page,
} from "@playwright/test";

type GeneratedSiteRoot = Page | FrameLocator;

/** Search controls and results rendered inside a generated Meadow site. */
export class GeneratedSiteSearch {
  constructor(
    private root: GeneratedSiteRoot,
    private expect: Expect,
  ) {}

  private get openButton() {
    return this.root.getByRole("button", {
      name: "Search this site",
      exact: true,
    });
  }

  private get input() {
    return this.root.getByRole("searchbox", { name: "Search this site" });
  }

  private get titleResultsSection() {
    return this.root.locator('[data-search-results-kind="title"]');
  }

  private get contentResultsSection() {
    return this.root.locator('[data-search-results-kind="content"]');
  }

  async open() {
    await this.expect(this.openButton).toBeVisible({ timeout: 30_000 });
    await this.openButton.click();
    await this.expect(this.input).toBeVisible();
  }

  async search(query: string) {
    await this.input.fill(query);
  }

  /** Assert every title result, including its order and exact visible text. */
  async expectTitleResults(titles: string[]) {
    await this.expect(
      this.titleResultsSection.getByRole("heading", { name: "Page titles" }),
    ).toBeVisible();
    await this.expect(
      this.titleResultsSection.locator(
        '[data-search-result-kind="title"] > .meadow-search-result-title',
      ),
    ).toHaveText(titles);
  }

  async expectContentResult(title: string, snippetText: string) {
    await this.expect(
      this.contentResultsSection.getByRole("heading", { name: "Page contents" }),
    ).toBeVisible();
    const result = this.contentResultsSection.locator(
      '[data-search-result-kind="content"]',
      { hasText: snippetText },
    );
    await this.expect(result).toBeVisible();
    await this.expect(result.locator(".meadow-search-result-title")).toHaveText(title);
    await this.expect(result.locator(".meadow-search-result-snippet")).toContainText(
      snippetText,
    );
  }

  async clickResult(kind: "title" | "content", title: string) {
    const result = this.root.locator(`[data-search-result-kind="${kind}"]`, {
      hasText: title,
    });
    await this.expect(result).toBeVisible();
    await result.click();
  }

  async expectUnavailable() {
    await this.expect(this.openButton).not.toBeVisible({ timeout: 30_000 });
  }

  /** Assert that Search and Sources use exactly the same control height. */
  async expectSameHeightAsSources() {
    const sourcesControl = this.root.locator(".sources-export-download").first();
    await this.expect(sourcesControl).toBeVisible({ timeout: 30_000 });
    await this.expect(this.openButton).toBeVisible({ timeout: 30_000 });

    const [sourcesBox, searchBox] = await Promise.all([
      sourcesControl.boundingBox(),
      this.openButton.boundingBox(),
    ]);
    this.expect(sourcesBox).not.toBeNull();
    this.expect(searchBox).not.toBeNull();
    this.expect(searchBox!.height).toBe(sourcesBox!.height);
  }
}

/** Sources and Open Knowledge Format controls rendered by a generated site. */
export class GeneratedSiteSources {
  constructor(
    private hostPage: Page,
    private root: GeneratedSiteRoot,
    private expect: Expect,
  ) {}

  private get sourcesDownloadButton() {
    return this.root.locator("a.sources-export-download", { hasText: "sources" });
  }

  private get okfPackageButton() {
    return this.root.locator("summary.sources-export-download", { hasText: "OKF" });
  }

  private get heading() {
    return this.root.locator("h1").first();
  }

  private get okfZipDownloadLink() {
    return this.root.getByRole("link", { name: "Download ZIP" });
  }

  async expectControlsAligned() {
    await this.expect(this.sourcesDownloadButton).toBeVisible({ timeout: 15_000 });
    await this.expect(this.okfPackageButton).toBeVisible({ timeout: 15_000 });
    const [sourcesBox, okfBox] = await Promise.all([
      this.sourcesDownloadButton.boundingBox(),
      this.okfPackageButton.boundingBox(),
    ]);
    this.expect(sourcesBox).not.toBeNull();
    this.expect(okfBox).not.toBeNull();
    this.expect(Math.abs(okfBox!.y - sourcesBox!.y)).toBeLessThan(1);
    this.expect(Math.abs(okfBox!.height - sourcesBox!.height)).toBeLessThan(1);
  }

  async openOkfMenuWithoutShiftingPage() {
    const headingBoxBefore = await this.heading.boundingBox();
    this.expect(headingBoxBefore).not.toBeNull();
    await this.okfPackageButton.click();
    await this.expect(this.okfZipDownloadLink).toBeVisible();
    const headingBoxAfter = await this.heading.boundingBox();
    this.expect(headingBoxAfter).not.toBeNull();
    this.expect(Math.abs(headingBoxAfter!.y - headingBoxBefore!.y)).toBeLessThan(1);
  }

  async dismissOkfMenu() {
    await this.root.locator("body").click({ position: { x: 8, y: 140 } });
    await this.expect(this.okfZipDownloadLink).not.toBeVisible();
  }

  async openOkfMenu() {
    await this.okfPackageButton.click();
    await this.expect(this.okfZipDownloadLink).toBeVisible();
  }

  async downloadOkfZip(): Promise<Download> {
    const downloadPromise = this.hostPage.waitForEvent("download");
    await this.okfZipDownloadLink.click();
    return downloadPromise;
  }

  async openOkfBundleIndex() {
    await this.okfPackageButton.click();
    await this.root.getByRole("link", { name: "Bundle index" }).click();
  }
}

/** Excalidraw-specific behavior inside a generated site. */
export class GeneratedSiteExcalidraw {
  constructor(
    private hostPage: Page,
    private root: GeneratedSiteRoot,
    private expect: Expect,
  ) {}

  private embedLink(hrefFragment?: string) {
    const selector = hrefFragment
      ? `a.meadow-excalidraw-embed-link[href*="${hrefFragment}"]`
      : "a.meadow-excalidraw-embed-link";
    return this.root.locator(selector).first();
  }

  private get standaloneDrawing() {
    return this.root.locator(".meadow-excalidraw-page svg").first();
  }

  private standaloneDrawingLink(href: string) {
    return this.root.locator(
      `.meadow-excalidraw-page svg a[href="${href}"]`,
    );
  }

  private get directedEmbedFrame() {
    return this.root.locator(".meadow-excalidraw-embed-frame").first();
  }

  private get directedEmbed() {
    return this.directedEmbedFrame
      .locator(".meadow-excalidraw-can-fullscreen")
      .first();
  }

  private directedDrawingLink(href: string) {
    return this.directedEmbed.locator(`svg a[href="${href}"]`);
  }

  async expectEmbedVisible(hrefFragment?: string) {
    const embed = this.embedLink(hrefFragment);
    await embed.scrollIntoViewIfNeeded();
    await this.expect(embed.locator("svg").first()).toBeVisible({ timeout: 30_000 });
  }

  async clickEmbed(hrefFragment?: string) {
    await this.embedLink(hrefFragment).click();
  }

  async expectStandaloneDrawingVisible() {
    await this.expect(this.standaloneDrawing).toBeVisible({ timeout: 30_000 });
  }

  async expectStandaloneDrawingLink(href: string, text?: string) {
    const link = this.standaloneDrawingLink(href);
    await this.expect(link).toHaveCount(1);
    if (text) await this.expect(link).toContainText(text);
  }

  async expectNoStandaloneDrawingLink(href: string) {
    await this.expect(this.standaloneDrawingLink(href)).toHaveCount(0);
  }

  async expectNoStandaloneDrawingLinkContaining(hrefFragment: string) {
    await this.expect(
      this.root.locator(
        `.meadow-excalidraw-page svg a[href*="${hrefFragment}"]`,
      ),
    ).toHaveCount(0);
  }

  async expectStandaloneDrawingText(text: string, count = 1) {
    await this.expect(
      this.root.locator(".meadow-excalidraw-page svg text", { hasText: text }),
    ).toHaveCount(count);
  }

  async clickStandaloneDrawingLink(
    href: string,
    options?: { modifiers?: Array<"Alt" | "Control" | "Meta" | "Shift"> },
  ) {
    await this.standaloneDrawingLink(href).click(options);
  }

  async openStandaloneDrawingLinkInNewTab(href: string): Promise<GeneratedSite> {
    const [newPage] = await Promise.all([
      this.hostPage.context().waitForEvent("page"),
      this.standaloneDrawingLink(href).click({ modifiers: ["Meta"] }),
    ]);
    await newPage.waitForLoadState("domcontentloaded");
    return GeneratedSite.onPage(newPage, this.expect);
  }

  async expectDirectedEmbedVisible() {
    await this.directedEmbedFrame.scrollIntoViewIfNeeded();
    await this.expect(this.directedEmbed.locator("svg").first()).toBeVisible({
      timeout: 30_000,
    });
  }

  async expectDirectedDrawingLink(href: string) {
    await this.expect(this.directedDrawingLink(href)).toHaveCount(1);
  }

  async expectDirectedStandaloneLinkAbsent() {
    await this.expect(
      this.directedEmbedFrame.locator(".meadow-excalidraw-open-link"),
    ).toHaveCount(0);
  }

  async openDirectedFullscreen() {
    const button = this.directedEmbed
      .locator(".meadow-excalidraw-fullscreen-btn")
      .first();
    await this.expect(button).toBeVisible();
    await button.click({ force: true });
    await this.expect(this.directedEmbed).toHaveClass(/is-fullscreen/);
  }

  async closeDirectedFullscreen() {
    const button = this.directedEmbed
      .locator(".meadow-excalidraw-fullscreen-btn")
      .first();
    await button.press("Escape");
    await this.expect(this.directedEmbed).not.toHaveClass(/is-fullscreen/);
  }

  async clickDirectedDrawingLink(href: string) {
    await this.directedDrawingLink(href).click();
  }
}

/** A generated site, either in Meadow's preview iframe or a standalone page. */
export class GeneratedSite {
  readonly search: GeneratedSiteSearch;
  readonly sources: GeneratedSiteSources;
  readonly excalidraw: GeneratedSiteExcalidraw;

  private constructor(
    private hostPage: Page,
    private root: GeneratedSiteRoot,
    private expect: Expect,
  ) {
    this.search = new GeneratedSiteSearch(root, expect);
    this.sources = new GeneratedSiteSources(hostPage, root, expect);
    this.excalidraw = new GeneratedSiteExcalidraw(hostPage, root, expect);
  }

  static inPreview(page: Page, expect: Expect) {
    return new GeneratedSite(
      page,
      page.frameLocator('iframe[title="Preview"]'),
      expect,
    );
  }

  static onPage(page: Page, expect: Expect) {
    return new GeneratedSite(page, page, expect);
  }

  private get heading() {
    return this.root.locator("h1").first();
  }

  async expectHeading(text: string, timeout = 15_000) {
    await this.expect(this.heading).toContainText(text, { timeout });
  }

  async clickPageLink(name: string) {
    await this.root.getByRole("link", { name }).first().click();
  }

  async close() {
    await this.hostPage.close();
  }
}
