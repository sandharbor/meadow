# E2E Test Coding Standards

## One test per spec file

Every `.spec.ts` file must contain exactly one `test(...)` call. If the user
asks for multiple related scenarios, create multiple spec files. Never put
multiple tests in a single file.

## Use workflows for navigation

`e2e-tests/test-runner/src/run/workflows.ts` has composable helpers that chain page object
calls. Always check if an existing workflow method gets you where you need to go
before writing navigation code inline. If a useful navigation sequence doesn't
exist yet, add it to the `Workflows` class so future scenarios can reuse it.

```typescript
// GOOD — use the workflow
const wf = new Workflows(page, expect);
await wf.navigateToBigSiteShareTab();

// BAD — inlining navigation that a workflow already handles
const siteList = new SiteListPage(page, expect);
await siteList.goto();
await siteList.clickSite("meadow-test-site-big");
// ... etc
```

The `Workflows` class composes page objects at a high level:

- `navigateToBigSite()` → site list → editor loaded
- `navigateToBigSitePreview()` → … → preview modal open
- `navigateToBigSiteShareTab()` → … → Share / Publish to Meadow tab

It also exports typed enums for fixtures and sites:

```typescript
import { Workflows, Fixture, Site } from "../src/run/workflows.js";
```

## Page objects own their selectors

Each page object defines its UI concepts as private getters at the top of the
class. Methods reference these concepts — never duplicate a selector string
across methods. When adding new interactions to a page object, check if a
locator getter already exists for that element.

```typescript
// GOOD — locator defined once, used by multiple methods
private get saveChangesBtn() {
  return this.page.locator("button", { hasText: "Save Changes" });
}

async clickSaveChanges() {
  await this.expect(this.saveChangesBtn).toBeEnabled();
  await this.saveChangesBtn.click();
}

async saveChangesIfNeeded() {
  const visible = await this.saveChangesBtn.isVisible({ timeout: 2_000 }).catch(() => false);
  if (visible && (await this.saveChangesBtn.isEnabled())) {
    await this.saveChangesBtn.click();
  }
}

// BAD — same selector string repeated in each method
async clickSaveChanges() {
  const btn = this.page.locator("button", { hasText: "Save Changes" });
  await btn.click();
}
async saveChangesIfNeeded() {
  const btn = this.page.locator("button", { hasText: "Save Changes" });
  // ...
}
```

## Reuse page objects, don't inline selectors in tests

If a test needs to interact with a UI element, that interaction belongs in a
page object method. Tests should read as a sequence of meaningful actions, not
raw Playwright calls. Create or extend page objects in
`e2e-tests/test-runner/src/run/pages/` as needed, and make sure new ones are exported from
`e2e-tests/test-runner/src/run/pages/index.ts`.

## Decompose page objects by UI section

When a page object contains multiple distinct UI sections that have little to do
with each other, model them as nested objects rather than flat methods. This
keeps each section's locators and actions cohesive and makes test code read as a
natural hierarchy that mirrors the UI.

```typescript
// GOOD — nested sections reflect UI structure
const customizeTab = new CustomizeTab(page, expect);
await customizeTab.hooks.switchScopeToGlobal();
const hook = customizeTab.hooks.getHook("Page Title");
await hook.clickEdit();
await hook.modifyContent("'video'", "'vulkan'");
await hook.save();

// BAD — flat methods blur the boundaries between unrelated sections
await customizeTab.switchHooksScopeToGlobal();
await customizeTab.clickEditPageTitleHook();
await customizeTab.modifyHookContent("'video'", "'vulkan'");
await customizeTab.saveHook();
```

For repeating UI patterns (like individual hook rows or setting rows), expose a
factory method (e.g. `getHook(label)`) that returns an object representing a
single instance, rather than hard-coding a method per instance
(e.g. `clickEditPageTitleHook`).

## Page object folder structure

Only two top-level items in `src/run/pages/` are actual pages in the UI:
**SiteListPage** and **SiteEditorPage**. Everything else is a component (panel,
modal, tab, etc.) that lives inside one of those pages.

The folder structure reflects this hierarchy:

```
src/run/pages/
├── index.ts                          # barrel — re-exports everything
├── shared/                           # components used by multiple pages
│   ├── CreateAndEditSiteModal.ts
│   └── PublishedSitePage.ts
├── SiteListPage/
│   └── SiteListPage.ts
└── SiteEditorPage/
    ├── SiteEditorPage.ts
    └── components/
        ├── FilterPanelComponent.ts
        ├── SelectedPageDetailComponent.ts
        ├── LinksModal.ts
        └── PreviewPublishModal/
            ├── PreviewPublishModal.ts
            └── components/
                └── PublishToMeadowTab.ts
```

### Naming conventions

- **Pages** are suffixed with `Page` (e.g. `SiteEditorPage`, `SiteListPage`).
- **Components** are suffixed with `Component` (e.g. `FilterPanelComponent`,
  `SelectedPageDetailComponent`).
- **Modals** are suffixed with `Modal` (e.g. `PreviewPublishModal`, `LinksModal`).
- **Tabs** within a modal are suffixed with `Tab` (e.g. `PublishToMeadowTab`).

### Placement rules

1. If a component is used by **only one page**, nest it under that page's
   `components/` folder.
2. If a component is used by **multiple pages**, place it in `shared/`.
3. If a component is large enough to have its own sub-components (like
   `PreviewPublishModal`), give it its own folder with a `components/`
   subfolder.
