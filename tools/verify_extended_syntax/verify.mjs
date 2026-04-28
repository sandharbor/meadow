import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SITE_DIR = path.join(
  REPO_ROOT,
  "app/system_tests/expected_results/meadow-test-site-big-preview"
);
const PAGE_FILE = "t025 - extended syntax.html";
const PORT = 4789;
const SCREENSHOT = path.join(__dirname, "t025-rendered.png");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".json": "application/json",
};

function serve(root) {
  return http
    .createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      const filePath = path.join(root, urlPath);
      if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end();
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end(String(err));
          return;
        }
        res.writeHead(200, {
          "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
        });
        res.end(data);
      });
    })
    .listen(PORT);
}

function check(label, passed, detail = "") {
  const mark = passed ? "✅" : "❌";
  console.log(`  ${mark} ${label}${detail ? `  — ${detail}` : ""}`);
  return passed;
}

async function run() {
  if (!fs.existsSync(path.join(SITE_DIR, PAGE_FILE))) {
    console.error(`Missing rendered page: ${path.join(SITE_DIR, PAGE_FILE)}`);
    console.error(`Run the system tests first so expected_results is populated.`);
    process.exit(1);
  }

  const server = serve(SITE_DIR);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });

  const url = `http://localhost:${PORT}/${encodeURIComponent(PAGE_FILE)}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.screenshot({ path: SCREENSHOT, fullPage: true });

  console.log(`\nRendered page at ${url}`);
  console.log(`Screenshot: ${SCREENSHOT}\n`);

  const probes = await page.evaluate(() => {
    const txt = document.body.innerText;
    const html = document.body.innerHTML;

    const firstTable = document.querySelector("main table");
    const alignTable = document.querySelectorAll("main table")[1];
    const alignedCells = alignTable
      ? Array.from(alignTable.querySelectorAll("td,th")).filter(
          (c) => c.getAttribute("align") !== null
        ).length
      : 0;

    const computedAligns = alignTable
      ? Array.from(alignTable.querySelectorAll("tr"))
          .slice(1, 2)
          .flatMap((row) =>
            Array.from(row.querySelectorAll("td")).map(
              (c) => getComputedStyle(c).textAlign
            )
          )
      : [];

    return {
      hasTable: !!firstTable,
      tableAlignAttrsPresent: alignedCells > 0,
      tableAlignComputed: computedAligns,

      hasCodeBlock: !!document.querySelector("pre > code.fenced-code"),
      hasSyntaxHighlight: !!document.querySelector('pre > code.language-json'),

      footnoteRefRendered: !!document.querySelector('a[href^="#fn"]'),
      footnoteRawVisible: txt.includes("[^1]") || txt.includes("[^bignote]"),

      headingIdCustom: !!document.getElementById("custom-id"),
      headingIdRaw: txt.includes("{#custom-id}"),

      definitionListRendered: !!document.querySelector("dl"),
      definitionListRaw: /^\s*:\s/m.test(txt),

      strikethroughRendered: !!document.querySelector("del, s"),
      strikethroughRaw: txt.includes("~~The world is flat.~~"),

      taskListRendered: !!document.querySelector('input[type="checkbox"]'),
      taskListRaw: txt.includes("- [x]") || txt.includes("- [ ]"),

      emojiCopyPaste: txt.includes("⛺") && txt.includes("😂"),
      emojiShortcodeRendered: txt.includes("⛺ Be back soon") === false && !txt.includes(":tent:"),
      emojiShortcodeRaw: txt.includes(":tent:") || txt.includes(":joy:"),

      highlightRendered: !!document.querySelector("mark"),
      highlightRaw: txt.includes("==very important words=="),

      subscriptRendered: !!document.querySelector("sub"),
      subscriptRaw: txt.includes("H~2~O"),

      superscriptRendered: !!document.querySelector("sup"),
      superscriptRaw: txt.includes("X^2^"),

      autoUrlLinked:
        !!document.querySelector('a[href="http://www.example.com"]') &&
        !!document.querySelector('a[href="https://www.markdownguide.org"]'),
      autoUrlDisabledInCode:
        !!document.querySelector("code") &&
        Array.from(document.querySelectorAll("code")).some((el) =>
          el.textContent.includes("http://www.example.com")
        ),
    };
  });

  console.log("Extended syntax feature probes:");

  console.log("\n[Tables]");
  check("Basic table renders as <table>", probes.hasTable);
  check(
    "Alignment table has align attributes",
    probes.tableAlignAttrsPresent,
    probes.tableAlignAttrsPresent
      ? `computed text-align per cell: ${JSON.stringify(probes.tableAlignComputed)}`
      : "no align attrs on td/th"
  );

  console.log("\n[Code]");
  check("Fenced code block renders", probes.hasCodeBlock);
  check("Syntax-highlight class present", probes.hasSyntaxHighlight);

  console.log("\n[Footnotes]");
  check("Footnote refs rendered (<a href='#fn...'>)", probes.footnoteRefRendered);
  check("Raw [^1] NOT visible", !probes.footnoteRawVisible);

  console.log("\n[Heading IDs]");
  check("Custom heading id applied", probes.headingIdCustom);
  check("Raw {#custom-id} NOT visible", !probes.headingIdRaw);

  console.log("\n[Definition Lists]");
  check("Rendered as <dl>", probes.definitionListRendered);
  check("Raw ': definition' NOT visible", !probes.definitionListRaw);

  console.log("\n[Strikethrough]");
  check("Rendered as <del>/<s>", probes.strikethroughRendered);
  check("Raw ~~...~~ NOT visible", !probes.strikethroughRaw);

  console.log("\n[Task Lists]");
  check("Rendered as checkboxes", probes.taskListRendered);
  check("Raw - [x] / - [ ] NOT visible", !probes.taskListRaw);

  console.log("\n[Emoji]");
  check("Copy-paste emoji visible (⛺, 😂)", probes.emojiCopyPaste);
  check("Emoji shortcode :tent: converted", !probes.emojiShortcodeRaw);

  console.log("\n[Highlight]");
  check("Rendered as <mark>", probes.highlightRendered);
  check("Raw ==...== NOT visible", !probes.highlightRaw);

  console.log("\n[Subscript]");
  check("Rendered as <sub>", probes.subscriptRendered);
  check("Raw H~2~O NOT visible", !probes.subscriptRaw);

  console.log("\n[Superscript]");
  check("Rendered as <sup>", probes.superscriptRendered);
  check("Raw X^2^ NOT visible", !probes.superscriptRaw);

  console.log("\n[URL Linking]");
  check("Bare URLs auto-linked", probes.autoUrlLinked);
  check("URL inside backticks stays in <code>", probes.autoUrlDisabledInCode);

  await browser.close();
  server.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
