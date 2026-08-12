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
import { createHash } from "crypto";
import os from "os";
import path from "path";
import YAML from "yaml";
import { Site } from "../workflows.js";

interface SiteNodeConfigYaml {
  nodes?: Array<{
    fileType: string;
    inlinksDepth?: number;
    listType: "blacklist" | "whitelist";
    outlinksDepth?: number;
    sourceGraphSubdirectory?: string;
    siteNodeId: string;
    siteNodeKind: "file";
    siteNodeName: string;
  }>;
}

export interface OkfSeedPage {
  relativePath: string;
  content: string;
  tracked?: boolean;
  linkFromMain?: boolean;
}

export interface OkfBigSiteSeedOptions {
  pages: OkfSeedPage[];
  mainPageAppend?: string[];
}

export interface OkfTrackedFileSeedOptions {
  directory?: string;
  fileName?: string;
}

function relativePathForPageName(pageName: string, options: OkfTrackedFileSeedOptions = {}): string {
  const fileName = options.fileName || (pageName.endsWith(".md") ? pageName : `${pageName}.md`);
  return options.directory ? path.posix.join(options.directory, fileName) : fileName;
}

function sourceGraphSubdirectoryFor(relativePath: string): string {
  const dir = path.posix.dirname(relativePath);
  return dir === "." ? "" : dir;
}

function titleFor(relativePath: string): string {
  const basename = path.posix.basename(relativePath);
  return basename.endsWith(".md") ? basename.slice(0, -".md".length) : basename;
}

function wikiTargetFor(relativePath: string): string {
  return relativePath.endsWith(".md") ? relativePath.slice(0, -".md".length) : relativePath;
}

function writeSourceFile(sourceGraphDir: string, relativePath: string, content: string): void {
  const filePath = path.join(sourceGraphDir, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

export function seedOkfBigSite(configDir: string, options: OkfBigSiteSeedOptions): string {
  const siteDir = path.join(configDir, "sites", Site.Big);
  const siteConfigPath = path.join(siteDir, "conf", "site_config.yaml");
  const siteNodeConfigPath = path.join(siteDir, "conf", "site_node_config.yaml");
  const siteConfig = YAML.parse(fs.readFileSync(siteConfigPath, "utf8")) as Record<string, unknown>;
  const originalSourceDirectory = String(siteConfig.sourceDirectory || "");
  const sourceGraphCopy = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-okf-source-graph-"));

  fs.cpSync(originalSourceDirectory, sourceGraphCopy, {
    recursive: true,
    filter: (src) => !src.includes(".DS_Store"),
  });
  siteConfig.sourceDirectory = sourceGraphCopy;
  fs.writeFileSync(siteConfigPath, YAML.stringify(siteConfig), "utf8");

  const linkedPages = options.pages.filter(page => page.linkFromMain);
  if (linkedPages.length > 0 || options.mainPageAppend?.length) {
    fs.appendFileSync(
      path.join(sourceGraphCopy, "main page.md"),
      [
        "",
        "",
        "OKF test pages:",
        "",
        ...linkedPages.map(page => `[[${wikiTargetFor(page.relativePath)}]]`),
        ...(options.mainPageAppend || []),
        "",
      ].join("\n"),
      "utf8",
    );
  }

  for (const page of options.pages) {
    writeSourceFile(sourceGraphCopy, page.relativePath, page.content);
  }

  const siteNodeConfig = YAML.parse(fs.readFileSync(siteNodeConfigPath, "utf8")) as SiteNodeConfigYaml;
  const nodes = Array.isArray(siteNodeConfig.nodes) ? siteNodeConfig.nodes : [];
  const ensureNode = (seedPage: OkfSeedPage) => {
    const sourceGraphSubdirectory = sourceGraphSubdirectoryFor(seedPage.relativePath);
    const siteNodeName = titleFor(seedPage.relativePath);
    const exists = nodes.some((node) =>
      node.siteNodeName === siteNodeName &&
      (node.sourceGraphSubdirectory || "") === sourceGraphSubdirectory &&
      node.fileType === "md"
    );
    if (!exists) {
      const locator = `${sourceGraphSubdirectory}\u0000${siteNodeName}\u0000md`;
      nodes.push({
        fileType: "md",
        listType: "whitelist",
        sourceGraphSubdirectory,
        siteNodeId: createHash("sha256").update(`okf-e2e:${locator}`).digest("hex").slice(0, 12),
        siteNodeKind: "file",
        siteNodeName,
      });
    }
  };

  for (const page of options.pages) {
    if (page.tracked !== false) {
      ensureNode(page);
    }
  }
  fs.writeFileSync(siteNodeConfigPath, YAML.stringify({ ...siteNodeConfig, nodes }), "utf8");

  return sourceGraphCopy;
}

export function seedTrackedAndLinkedFile(
  configDir: string,
  pageName: string,
  content: string,
  options: OkfTrackedFileSeedOptions = {},
): void {
  seedOkfBigSite(configDir, {
    pages: [
      {
        relativePath: relativePathForPageName(pageName, options),
        content,
        linkFromMain: true,
      },
    ],
  });
}

export function seedTrackedFile(
  configDir: string,
  pageName: string,
  content: string,
  options: OkfTrackedFileSeedOptions = {},
): void {
  seedOkfBigSite(configDir, {
    pages: [
      {
        relativePath: relativePathForPageName(pageName, options),
        content,
      },
    ],
  });
}
