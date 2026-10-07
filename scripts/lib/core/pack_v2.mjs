// Packing a spine-v2 package for Alembic (redesign P8; req.publish.scope, req.ms2.public-only, req.oldgate.retired).
// The pack is exactly the instructor's latest publish decision, and only while the package still matches it: the
// chapters it published, the course map only if it was approved, draft chapters only in a private package and marked
// as drafts. No other gate runs here — the decision was made on the one gate (full_gate.mjs); check_oer, the carrier
// rebuild and the human visual attestation are not part of a v2 release (D24; the charter's two mandatory acts).
// A private package is packed with its profile recorded; it is never cleared for public release.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { latestPublish } from "./workflow.mjs";
import { shippedFiles, uncheckedShipped } from "./shipped.mjs";
import { liveReader } from "./package_reader.mjs";
import { parseLog, readLogText } from "../records/log.mjs";
import { canonicalJson } from "../records/canonical.mjs";

export function packPublished(pkg, outDir) {
  const pub = latestPublish(pkg);
  if (!pub) return { ok: false, error: "there is no publish decision: the instructor publishes first (node scripts/coursewerk.mjs publish …)" };
  if (!pub.current) return { ok: false, error: `the package changed after publish decision #${pub.seq}: publish again (node scripts/coursewerk.mjs publish …) before packing` };
  // The pack ships only what the publish content hash binds, plus the log; the decision record it ships is rebuilt from
  // the logged decision, and an on-disk record that says otherwise is refused (red team R1 coherence, F9).
  const logged = parseLog(readLogText(pkg)).find((r) => r.seq === pub.seq);
  const record = { seq: logged.seq, at: logged.at, by: logged.party.name, ...logged.payload };
  const recordRel = `metadata/publish/${String(pub.seq).padStart(4, "0")}.json`;
  if (fs.existsSync(path.join(pkg, recordRel))) {
    let onDisk = null; try { onDisk = JSON.parse(fs.readFileSync(path.join(pkg, recordRel), "utf8")); } catch { /* unreadable: differs */ }
    if (canonicalJson(onDisk) !== canonicalJson(record)) return { ok: false, error: `${recordRel} differs from the logged publish decision #${pub.seq}: restore it from git (the log is the record; the file is only its copy)` };
  }
  const published = new Set(pub.chapters.map((c) => c.chapter)), drafts = new Set((pub.drafts || []).map((d) => d.chapter));
  const keep = (slug) => published.has(slug) || drafts.has(slug);
  // what ships is what the gate checked: one computation (shipped.mjs; red team round 2, C3-04, C3-07)
  const unchecked = uncheckedShipped(pkg, liveReader(pkg), { keep, course: !!pub.course });
  if (unchecked.documents.length || unchecked.includes.length)
    return { ok: false, error: `refusing to pack what nothing checked: ${[...unchecked.documents.map((r) => `${r} (not a declared document)`), ...unchecked.includes.map((x) => `${x.file} includes ${x.target} (not a deliverable)`)].join("; ")} — declare each in metadata/DOCUMENTS.json, or remove it` };
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-pack-"));
  const staged = path.join(work, "staged");
  const shipped = shippedFiles(pkg, { keep, course: !!pub.course });
  let files = 0;
  const left = shipped.left;
  for (const r of shipped.files) {
    const dest = path.join(staged, r);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (r === "alembic.json") {
      const m = JSON.parse(fs.readFileSync(path.join(pkg, r), "utf8"));
      m.chapters = (m.chapters || []).filter((c) => keep(c.slug)).map((c) => (drafts.has(c.slug) ? { ...c, draft: true } : c));
      fs.writeFileSync(dest, JSON.stringify(m, null, 2) + "\n");
    } else fs.copyFileSync(path.join(pkg, r), dest);
    fs.utimesSync(dest, new Date("2000-01-01T00:00:00Z"), new Date("2000-01-01T00:00:00Z"));
    files++;
  }
  const decision = { publishSeq: pub.seq, profile: pub.profile, contentHash: pub.contentHash, chapters: [...published], drafts: [...drafts], course: !!pub.course,
    openQuestions: pub.openQuestions.length, clearedForPublicRelease: pub.profile === "public" && drafts.size === 0 };
  fs.mkdirSync(path.join(staged, "metadata", "publish"), { recursive: true });
  fs.writeFileSync(path.join(staged, recordRel), JSON.stringify(record, null, 2) + "\n");
  fs.utimesSync(path.join(staged, recordRel), new Date("2000-01-01T00:00:00Z"), new Date("2000-01-01T00:00:00Z"));
  files++;
  fs.writeFileSync(path.join(staged, "metadata", "PUBLISHED.json"), JSON.stringify(decision, null, 2) + "\n");
  fs.utimesSync(path.join(staged, "metadata", "PUBLISHED.json"), new Date("2000-01-01T00:00:00Z"), new Date("2000-01-01T00:00:00Z"));
  fs.mkdirSync(outDir, { recursive: true });
  const title = JSON.parse(fs.readFileSync(path.join(pkg, "alembic.json"), "utf8")).title || "course";
  const base = (title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "course") + (pub.profile === "private" ? ".private" : "");
  const zipPath = path.join(outDir, `${base}.alembic.zip`);
  fs.rmSync(zipPath, { force: true });
  const z = spawnSync("zip", ["-r", "-q", "-X", "-D", zipPath, "."], { cwd: staged, encoding: "utf8" });
  fs.rmSync(work, { recursive: true, force: true });
  if (z.status !== 0) return { ok: false, error: `zip failed: ${z.stderr || z.stdout}` };
  const archiveSha256 = crypto.createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex");
  const receipt = { schemaVersion: 3, ...decision, archive: path.basename(zipPath), archiveSha256, filesPacked: files, filesLeftOut: left, createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(outDir, `${base}.release.json`), JSON.stringify(receipt, null, 2) + "\n");
  return { ok: true, zip: zipPath, ...receipt };
}
