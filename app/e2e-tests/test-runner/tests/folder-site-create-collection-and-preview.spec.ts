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

import fs from "fs";
import os from "os";
import path from "path";
import YAML from "yaml";
import { test, expect } from "../src/run/test-fixtures.js";
import {
  CreateAndEditSiteModal,
  PreviewPublishModal,
  SiteEditorPage,
  SiteListPage,
} from "../src/run/pages/index.js";
import { Fixture } from "../src/run/workflows.js";
import { folderSites, htmlGeneration } from "../src/scenario-docs/index.js";
import { customSite } from "../src/site-docs/index.js";

test.use({ siteMode: "multiple-folders" });

test.use({ fixtureHome: Fixture.None });

interface StoredSiteNode {
  siteNodeId: string;
  siteNodeName: string;
  siteNodeKind: "file" | "folder" | "collection";
  sourceGraphSubdirectory?: string;
  listType: "whitelist" | "blacklist";
  memberSiteNodeIds?: string[];
}

function createFolderSource(): string {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-folder-site-e2e-"));
  fs.mkdirSync(path.join(sourceRoot, "Alpha"), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, "Beta"), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, "Outside"), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, "Alpha", "Alpha note.md"), "# Alpha note\n", "utf8");
  fs.writeFileSync(path.join(sourceRoot, "Beta", "Beta note.md"), "# Beta note\n", "utf8");
  fs.writeFileSync(path.join(sourceRoot, "Outside", "Outside note.md"), "# Outside note\n", "utf8");
  return sourceRoot;
}

function readStoredNodes(configDir: string, slug: string): StoredSiteNode[] {
  const configPath = path.join(configDir, "sites", slug, "conf", "site_node_config.yaml");
  const document = YAML.parse(fs.readFileSync(configPath, "utf8")) as { nodes: StoredSiteNode[] };
  return document.nodes;
}

test("preserves selected-folder order in a generated collection site", async ({
  page,
  testServer,
  snapshot,
  addKeyFrame,
  assertMeadowHomeState,
}) => {
  const sourceRoot = createFolderSource();
  try {
    const siteList = new SiteListPage(page, expect);
    const editor = new SiteEditorPage(page, expect);
    const createModal = new CreateAndEditSiteModal(page, expect);
    const previewModal = new PreviewPublishModal(page, expect);
    const alpha = path.join(sourceRoot, "Alpha");
    const beta = path.join(sourceRoot, "Beta");

    await siteList.goto();
    await siteList.clickCreateSiteLink();
    await createModal.fillSourceDirectory(sourceRoot);
    await createModal.selectFolderEntryStrategy();
    await createModal.addFolders([alpha, beta]);
    await createModal.expectSelectedFolderOrder([alpha, beta]);
    await createModal.moveFolderEarlier(beta);
    await createModal.expectSelectedFolderOrder([beta, alpha]);
    await createModal.fillFolderSiteName("Ordered Folders");
    await createModal.clickReviewFolders();
    await createModal.expectFolderPrediction();
    await snapshot("ordered folders creation prediction");
    await addKeyFrame(folderSites);
    await createModal.clickCreateSite();

    await editor.waitForLoad("ordered-folders");
    const nodes = readStoredNodes(testServer.configDir, "ordered-folders");
    expect(nodes).toHaveLength(3);
    const collection = nodes.find(node => node.siteNodeKind === "collection");
    const betaNode = nodes.find(node => node.sourceGraphSubdirectory === "Beta");
    const alphaNode = nodes.find(node => node.sourceGraphSubdirectory === "Alpha");
    expect(collection).toMatchObject({
      siteNodeName: "Ordered Folders",
      listType: "whitelist",
      memberSiteNodeIds: [betaNode?.siteNodeId, alphaNode?.siteNodeId],
    });
    expect(nodes.filter(node => node.listType === "whitelist")).toHaveLength(3);
    expect(nodes.some(node => node.siteNodeKind === "file")).toBe(false);

    await editor.clickPreview();
    await previewModal.waitForPreviewComplete();
    await previewModal.generatedSite.expectHeading("Ordered Folders", 60_000);
    await snapshot("ordered collection generated home");
    await addKeyFrame(htmlGeneration);
    void customSite;

    await assertMeadowHomeState({
      allowedUntracked: [
        "sites/ordered-folders/html/",
        "sites/ordered-folders/raw/",
      ],
    });
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});
