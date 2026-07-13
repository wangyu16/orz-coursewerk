import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(repo, "site", "index.html"), "utf8");
const css = fs.readFileSync(path.join(repo, "site", "styles.css"), "utf8");
const workflow = fs.readFileSync(path.join(repo, ".github", "workflows", "pages.yml"), "utf8");
const cname = fs.readFileSync(path.join(repo, "site", "CNAME"), "utf8");

test("Coursewerk site is a self-contained static information architecture", () => {
  assert.match(html, /<h1>From source evidence/);
  for (const id of ["system", "assurance", "outputs", "start"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /assets\/orz\.svg/);
  assert.match(html, /rel="icon" href="assets\/coursewerk-favicon\.svg"/);
  assert.doesNotMatch(html, /rel="icon" href="assets\/orz\.svg"/);
  assert.match(html, /alt="orz"/);
  assert.match(html, /Preflight before public use/);
  assert.match(html, /A publisher’s AI-use notice is not automatically a copyright-license term/);
  assert.match(html, /asset directory travels with it/);
  assert.doesNotMatch(html, /<(?:script|iframe)\b/i);
  assert.doesNotMatch(html, /(?:src|href)="https?:\/\/(?!github\.com|markdown\.orz\.how)/i);
  assert.ok(css.length > 10000, "the designed theme should not collapse to an unstyled placeholder");
  assert.ok(fs.existsSync(path.join(repo, "site", "assets", "orz.svg")));
  assert.ok(fs.existsSync(path.join(repo, "site", "assets", "coursewerk-favicon.svg")));
  assert.equal(cname, "coursewerk.orz.how\n");
});

test("GitHub Pages workflow deploys only the site artifact", () => {
  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /enablement: true/);
  assert.match(workflow, /actions\/upload-pages-artifact@v3/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /path: site/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
});
