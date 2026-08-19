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
  Locator,
  Page,
} from "@playwright/test";

type GeneratedBundleRoot = Page | FrameLocator;

/** Hover preview behavior rendered inside a generated Meadow bundle. */
export class GeneratedBundleHoverPreview {
  constructor(
    private root: GeneratedBundleRoot,
    private expect: Expect,
  ) {}

  private get popup() {
    return this.root.locator(".hover-preview");
  }

  private popupLink(name: string) {
    return this.popup.getByRole("link", { name, exact: true });
  }

  async expectAvailable() {
    await this.expect(
      this.root.locator('script[src*="cust/hover_preview/hover-preview."]'),
    ).toHaveCount(1, { timeout: 60_000 });
  }

  async hoverFooterLink(name: string) {
    const sourceLink = this.root.locator("footer").getByRole("link", {
      name,
      exact: true,
    }).first();
    await this.expect(sourceLink).toBeVisible();
    await sourceLink.hover();
    await this.expect(this.popup).toBeVisible();
  }

  async expectLinkHref(name: string, href: RegExp) {
    await this.expect(this.popupLink(name)).toHaveAttribute("href", href);
  }

  async expectLinkDecorationMatchesFooterLink(
    previewLinkName: string,
    footerLinkName: string,
  ) {
    const footerLink = this.root.locator("footer").getByRole("link", {
      name: footerLinkName,
      exact: true,
    }).first();
    const decoration = async (link: Locator) =>
      link.evaluate(element => {
        const style = window.getComputedStyle(element);
        return {
          line: style.textDecorationLine,
          style: style.textDecorationStyle,
        };
      });

    await this.expect(
      await decoration(this.popupLink(previewLinkName)),
    ).toEqual(await decoration(footerLink));
  }

  async clickLink(name: string) {
    await this.popupLink(name).click();
  }
}

/** Search controls and results rendered inside a generated Meadow bundle. */
export class GeneratedBundleSearch {
  constructor(
    private root: GeneratedBundleRoot,
    private expect: Expect,
  ) {}

  private get openButton() {
    return this.root.getByRole("button", {
      name: "Search this bundle",
      exact: true,
    });
  }

  private get input() {
    return this.root.getByRole("searchbox", { name: "Search this bundle" });
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

/** Sources and Open Knowledge Format controls rendered by a generated bundle. */
export class GeneratedBundleSources {
  constructor(
    private hostPage: Page,
    private root: GeneratedBundleRoot,
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

/** Excalidraw-specific behavior inside a generated bundle. */
export class GeneratedBundleExcalidraw {
  constructor(
    private hostPage: Page,
    private root: GeneratedBundleRoot,
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
    // The lazy renderer replaces the link's contents as soon as it intersects.
    // A Playwright scroll action waits for stability and can therefore retain
    // the just-replaced node. Regeneration can also navigate the iframe at the
    // same instant, so retry only those two transient context failures.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await this.embedLink(hrefFragment)
          .evaluate(element => element.scrollIntoView({ block: "center" }));
        break;
      } catch (error) {
        const retryable = error instanceof Error
          && /Execution context was destroyed|not attached to the DOM/.test(error.message);
        if (!retryable || attempt === 4) throw error;
        await this.hostPage.waitForTimeout(100);
      }
    }
    await this.expect(this.embedLink(hrefFragment).locator("svg").first())
      .toBeVisible({ timeout: 30_000 });
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

  async openStandaloneDrawingLinkInNewTab(href: string): Promise<GeneratedBundle> {
    const [newPage] = await Promise.all([
      this.hostPage.context().waitForEvent("page"),
      this.standaloneDrawingLink(href).click({ modifiers: ["Meta"] }),
    ]);
    await newPage.waitForLoadState("domcontentloaded");
    return GeneratedBundle.onPage(newPage, this.expect);
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

/** SVG-specific behavior inside a generated bundle. */
export class GeneratedBundleSvg {
  constructor(
    private root: GeneratedBundleRoot,
    private expect: Expect,
  ) {}

  private get directedEmbedFrame() {
    return this.root.locator(".meadow-svg-embed-frame").first();
  }

  private get directedEmbedDocument() {
    return this.root.frameLocator("iframe.meadow-svg-embed");
  }

  private directedLink(href: string) {
    return this.directedEmbedDocument.locator(`svg a[href="${href}"]`);
  }

  async expectOrdinaryImageEmbeds(count: number) {
    await this.expect(
      this.root.locator('img[src*="meadow-flower.svg"]'),
    ).toHaveCount(count);
  }

  async expectDirectedEmbedVisible() {
    await this.directedEmbedFrame.scrollIntoViewIfNeeded();
    await this.expect(
      this.directedEmbedDocument.locator("svg"),
    ).toBeVisible({ timeout: 30_000 });
  }

  async expectDirectedLink(href: string) {
    await this.expect(this.directedLink(href)).toHaveCount(1);
  }

  async expectDirectedTextLink(href: string, text: string) {
    const linkedText = this.directedLink(href).locator("text");
    await this.expect(linkedText).toHaveCount(1);
    await this.expect(linkedText).toBeVisible();
    await this.expect(linkedText).toHaveText(text);
  }

  async expectDirectedShapeLink(href: string) {
    const linkedShape = this.directedLink(href).locator("circle").first();
    await this.expect(linkedShape).toBeVisible();
  }

  async expectDirectedStandaloneLinkAbsent() {
    await this.expect(
      this.directedEmbedFrame.locator(".meadow-svg-open-link"),
    ).toHaveCount(0);
  }

  async openDirectedFullscreen() {
    const button = this.directedEmbedFrame.getByRole("button", {
      name: "Open SVG fullscreen",
    });
    await this.expect(button).toBeVisible();
    await button.click();
    await this.expect(this.directedEmbedFrame).toHaveClass(/is-fullscreen/);
  }

  async closeDirectedFullscreen() {
    await this.root.locator("body").press("Escape");
    await this.expect(this.directedEmbedFrame).not.toHaveClass(/is-fullscreen/);
  }

  async clickDirectedLink(href: string) {
    await this.directedLink(href).click();
  }
}

/** Folder navigation rendered inside a generated Meadow bundle. */
export class GeneratedBundleFolderNavigation {
  constructor(
    private root: GeneratedBundleRoot,
    private expect: Expect,
  ) {}

  private get html() {
    return this.root.locator("html");
  }

  private get sidebar() {
    return this.root.locator("[data-meadow-folder-nav]");
  }

  private get openButton() {
    return this.root.getByRole("button", { name: "Open folder navigation" });
  }

  private folder(folderPath: string) {
    return this.root.locator(`details[data-folder-path="${folderPath}"]`);
  }

  private get rootTree() {
    return this.sidebar.locator(".meadow-folder-nav-tree");
  }

  async expectUnavailable() {
    await this.expect(this.sidebar).toHaveCount(0);
  }

  async expectAvailable() {
    await this.expect(this.sidebar).toHaveCount(1, { timeout: 30_000 });
  }

  async expectOpen() {
    await this.expectAvailable();
    await this.expect(this.html).toHaveAttribute(
      "data-meadow-folder-nav-open",
      "true",
    );
  }

  async expectClosed() {
    await this.expect(this.html).toHaveAttribute(
      "data-meadow-folder-nav-open",
      "false",
    );
  }

  async expectContentAlignedWithSidebar() {
    const content = this.root.locator(".meadow-bundle-content");
    await this.expect
      .poll(async () => {
        const sidebarWidth = (await this.sidebar.boundingBox())?.width;
        const marginLeft = await content.evaluate(element =>
          Number.parseFloat(window.getComputedStyle(element).marginLeft),
        );
        if (sidebarWidth === undefined) return Number.NaN;
        return Math.round(marginLeft - sidebarWidth);
      })
      .toBe(0);
  }

  async expectContentNotOffset() {
    await this.expect(this.root.locator(".meadow-bundle-content")).toHaveCSS(
      "margin-left",
      "0px",
    );
  }

  async expectDesktopTriggerFixedAtViewportEdge() {
    await this.expect(this.openButton).toBeVisible({ timeout: 30_000 });
    const placement = await this.openButton.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return {
        position: window.getComputedStyle(element).position,
        x: bounds.x,
        y: bounds.y,
      };
    });
    this.expect(placement.position).toBe("fixed");
    this.expect(Math.abs(placement.x - 12)).toBeLessThan(1);
    this.expect(Math.abs(placement.y - 12)).toBeLessThan(1);
  }

  async expectMobileHeaderControlsAligned() {
    const sources = this.root.locator(".sources-export-download").first();
    const search = this.root.getByRole("button", {
      name: "Search this bundle",
      exact: true,
    });
    await this.expect(this.openButton).toBeVisible({ timeout: 30_000 });
    await this.expect(sources).toBeVisible({ timeout: 30_000 });
    await this.expect(search).toBeVisible({ timeout: 30_000 });

    const boxes = await Promise.all([
      this.openButton.boundingBox(),
      sources.boundingBox(),
      search.boundingBox(),
    ]);
    this.expect(boxes.every(box => box !== null)).toBe(true);
    const verticalCenters = boxes.map(box => box!.y + box!.height / 2);
    this.expect(Math.max(...verticalCenters) - Math.min(...verticalCenters))
      .toBeLessThan(1);
  }

  async expectNoBreadcrumbs() {
    await this.expect(
      this.root.locator(".bundle-header-navigation .breadcrumbs"),
    ).toHaveCount(0);
  }

  async expectBreadcrumbsBelowHeaderControls() {
    const breadcrumbs = this.root.locator(
      ".bundle-header-navigation .breadcrumbs",
    );
    const actions = this.root.locator(".bundle-header-actions");
    await this.expect(breadcrumbs).toBeVisible({ timeout: 30_000 });

    const [openButtonBox, actionsBox, breadcrumbsBox] = await Promise.all([
      this.openButton.boundingBox(),
      actions.boundingBox(),
      breadcrumbs.boundingBox(),
    ]);
    this.expect(openButtonBox).not.toBeNull();
    this.expect(actionsBox).not.toBeNull();
    this.expect(breadcrumbsBox).not.toBeNull();
    const controlBottom = Math.max(
      openButtonBox!.y + openButtonBox!.height,
      actionsBox!.y + actionsBox!.height,
    );
    this.expect(breadcrumbsBox!.y).toBeGreaterThanOrEqual(controlBottom);
  }

  async openFolder(folderPath: string) {
    const folder = this.folder(folderPath);
    await this.expect(folder).toBeVisible();
    if (!(await folder.evaluate(details => (details as HTMLDetailsElement).open))) {
      await folder.locator(":scope > summary").click();
    }
    await this.expect(folder).toHaveJSProperty("open", true);
  }

  async expectFolderOpen(folderPath: string) {
    await this.expect(this.folder(folderPath)).toHaveJSProperty("open", true);
  }

  async expectDirectFileNames(folderPath: string, fileNames: string[]) {
    await this.expect(
      this.folder(folderPath).locator(
        ":scope > ul > li.meadow-folder-nav-file > a",
      ),
    ).toHaveText(fileNames);
  }

  async expectRootFolderNames(folderNames: string[]) {
    await this.expect(
      this.rootTree.locator(
        ":scope > li.meadow-folder-nav-folder > details > summary > span:last-child",
      ),
    ).toHaveText(folderNames);
  }

  async expectRootFileNames(fileNames: string[]) {
    await this.expect(
      this.rootTree.locator(
        ":scope > li.meadow-folder-nav-file > a",
      ),
    ).toHaveText(fileNames);
  }

  async clickFile(folderPath: string, fileName: string, force = false) {
    const link = this.folder(folderPath).getByRole("link", { name: fileName });
    if (force) {
      await link.evaluate(element => (element as HTMLAnchorElement).click());
      return;
    }
    await link.click();
  }

  async clickRootFile(fileName: string) {
    await this.rootTree.locator(":scope > li.meadow-folder-nav-file")
      .getByRole("link", { name: fileName, exact: true })
      .click();
  }

  async expectSelectedFile(fileName: string) {
    const selected = this.sidebar.locator('a[aria-current="page"]');
    await this.expect(selected).toHaveText(fileName, { timeout: 30_000 });
  }

  async expectResizable() {
    const resizeHandle = this.sidebar.getByRole("separator", {
      name: "Resize folder navigation",
    });
    const widthBefore = (await this.sidebar.boundingBox())?.width;
    this.expect(widthBefore).toBeDefined();
    await resizeHandle.focus();
    await resizeHandle.press("ArrowRight");
    await this.expect.poll(async () => (await this.sidebar.boundingBox())?.width)
      .toBeGreaterThan(widthBefore!);
  }

  async close() {
    await this.root.getByRole("button", { name: "Close folder navigation" }).click();
    await this.expectClosed();
  }

  async open() {
    await this.expectAvailable();
    if (await this.html.getAttribute("data-meadow-folder-nav-open") !== "true") {
      await this.openButton.click();
    }
    await this.expectOpen();
  }

  async reload() {
    await this.root.locator("body").evaluate(() => window.location.reload());
    await this.expect(this.root.locator("body")).toBeVisible({ timeout: 30_000 });
  }
}

/** A generated bundle, either in Meadow's preview iframe or a standalone page. */
export class GeneratedBundle {
  readonly hoverPreview: GeneratedBundleHoverPreview;
  readonly search: GeneratedBundleSearch;
  readonly sources: GeneratedBundleSources;
  readonly excalidraw: GeneratedBundleExcalidraw;
  readonly svg: GeneratedBundleSvg;
  readonly folderNavigation: GeneratedBundleFolderNavigation;

  private constructor(
    private hostPage: Page,
    private root: GeneratedBundleRoot,
    private expect: Expect,
  ) {
    this.hoverPreview = new GeneratedBundleHoverPreview(root, expect);
    this.search = new GeneratedBundleSearch(root, expect);
    this.sources = new GeneratedBundleSources(hostPage, root, expect);
    this.excalidraw = new GeneratedBundleExcalidraw(hostPage, root, expect);
    this.svg = new GeneratedBundleSvg(root, expect);
    this.folderNavigation = new GeneratedBundleFolderNavigation(root, expect);
  }

  static inPreview(page: Page, expect: Expect) {
    return new GeneratedBundle(
      page,
      page.frameLocator('iframe[title="Preview"]'),
      expect,
    );
  }

  static onPage(page: Page, expect: Expect) {
    return new GeneratedBundle(page, page, expect);
  }

  private get heading() {
    return this.root.locator("h1").first();
  }

  async expectHeading(text: string, timeout = 15_000) {
    await this.expect(this.heading).toContainText(text, { timeout });
  }

  async expectSingleHeading(text: string, timeout = 15_000) {
    await this.expect(this.root.locator("h1")).toHaveText([text], { timeout });
  }

  async expectStructuralChildNames(names: string[]) {
    await this.expect(this.root.locator(".structural-child-name")).toHaveText(names);
  }

  async expectStructuralImagePreview(name: string) {
    const child = this.root.locator(".structural-child", {
      has: this.root.locator(".structural-child-name", { hasText: name }),
    });
    await this.expect(child.locator(".structural-child-preview-image img")).toBeVisible();
  }

  async clickPageLink(name: string) {
    await this.root.getByRole("link", { name }).first().click();
  }

  async expectNativeHtmlCardColor(color: string) {
    await this.expect(this.root.locator(".html-node-card")).toHaveCSS("background-color", color);
  }

  async expectNativeHtmlSharedImageVisible() {
    await this.expect(
      this.root.getByRole("img", { name: "Purple flower shared by both HTML pages" }),
    ).toBeVisible();
  }

  async expectNativeHtmlSharedScriptLoaded() {
    await this.expect(this.root.locator("#script-status")).toHaveText("Shared JavaScript loaded.");
  }

  async close() {
    await this.hostPage.close();
  }
}
