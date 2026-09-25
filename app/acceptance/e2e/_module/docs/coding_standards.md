# E2E Test Coding Standards

## One test per spec file

Every `.spec.ts` file must contain exactly one `test(...)` call. If the user
asks for multiple related scenarios, create multiple spec files. Never put
multiple tests in a single file.

## Use workflows for navigation

`acceptance/e2e/src/run/workflows.ts` has composable helpers that chain page object
calls. Always check if an existing workflow method gets you where you need to go
before writing navigation code inline. If a useful navigation sequence doesn't
exist yet, add it to the `Workflows` class so future scenarios can reuse it.

```typescript
// GOOD — use the workflow
const wf = new Workflows(page, expect);
await wf.navigateToBigBundleShareTab();

// BAD — inlining navigation that a workflow already handles
const bundleList = new BundleListPage(page, expect);
await bundleList.goto();
await bundleList.clickBundle("meadow-test-bundle-big");
// ... etc
```

The `Workflows` class composes page objects at a high level:

- `navigateToBigBundle()` → bundle list → editor loaded
- `navigateToBigBundlePreview()` → … → preview modal open
- `navigateToBigBundleShareTab()` → … → Share tab

It also exports typed enums for fixtures and bundles:

```typescript
import { Workflows, Fixture, Bundle } from "../src/run/workflows.js";
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
`acceptance/e2e/src/run/pages/` as needed, and make sure new ones are exported from
`acceptance/e2e/src/run/pages/index.ts`.

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

Page objects follow the same app-area partitioning as the app's source code:
`shared/` for cross-cutting UI and `areas/<area>/` for UI owned by one area.
Place a page object in the area that owns the behavior it exercises, not in the
page where it happens to appear.

```
src/run/pages/
├── index.ts                          # barrel — re-exports page objects
├── shared/                           # app shell and cross-area UI
│   ├── BundleEditorPage.ts
│   ├── PreviewPublishModal.ts
│   ├── GeneratedBundle.ts
│   ├── AppPlace.ts
│   └── DeleteBundleModal.ts
├── areas/
│   ├── bundles/                      # the bundle list and bundle creation
│   │   ├── BundleListPage.ts
│   │   └── CreateAndEditBundleModal.ts
│   └── bundle/
│       ├── sourcing/                 # sources, source review, tracking notice
│       ├── curation/                 # filters, selection, page details, links
│       ├── generation/               # customization and output formats
│       ├── review/                   # preview changes
│       └── sharing/                  # publishing and published bundles
└── dev-tools/                        # Dev Tools controls used by scenarios
```

Composite page objects (such as `BundleEditorPage` or `PreviewPublishModal`)
live in `shared/` and expose area-owned page objects as nested members, e.g.
`editor.sourceReview.trackingNotice`.

### Naming conventions

- **Pages** are suffixed with `Page` (e.g. `BundleEditorPage`, `BundleListPage`).
- **Components** are suffixed with `Component` (e.g. `FilterPanelComponent`,
  `SelectedPageDetailComponent`).
- **Modals** are suffixed with `Modal` (e.g. `PreviewPublishModal`, `LinksModal`).
- **Tabs** within a modal are suffixed with `Tab` (e.g. `PublishToProviderTab`).

### Placement rules

1. If the UI belongs to **one app area**, place it under `areas/<area>/`.
2. If it spans **multiple areas** (the editor shell, the preview modal, the
   generated bundle), place it in `shared/`.
3. Keep area folders flat; split a large page object into sibling files in the
   same area rather than nesting `components/` folders.
