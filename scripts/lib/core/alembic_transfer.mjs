// Sending a course to Alembic, and taking it from there, from a computer (req.host.alembic-transfer; FC-16 §5, O7;
// Alembic's Door E: "Bring in a course from my computer" and "Bring it back").
//
//   prepareSend(root, { out, host })  the course folder as the zip Alembic takes, its records checked, and the one page
//                                     where the instructor chooses that zip
//   takeSteps({ root, course, host }) the page where the instructor hands the course to the computer, and what follows
//
// Coursewerk holds no credentials and sends nothing: Alembic takes a zip only from a signed-in person's own browser, and
// sending stays the instructor's act (CLAUDE.md "Outward actions are the instructor's"). So the command stops at a file
// and a link: the instructor opens the link and chooses the file. The folder itself is never changed: everything is
// staged in a temporary copy.
//
// What the zip holds is the folder in Alembic's site layout (site_export / site_host):
//   - a folder imported from a hand-out (.coursewerk-host.json "imported") is handed back in the copy (site_host
//     handbackSite: append-only against what Alembic holds), so Alembic's return check finds state "handed-back";
//   - otherwise only what is not yet in Alembic's layout is converted in the copy, and everything else goes as it is:
//       a decision log part over ROLL_BYTES is cut (site_export logParts on the joined log: a part Coursewerk cut stays
//       byte for byte), and review records held one file per record are wrapped onto the monthly .jsonl parts
//       (site_export verificationLines: the parts the folder holds are carried byte for byte, new lines appended);
//   - a chapter deck written as slides/<ch>.md goes as slides/<ch>.slides.md, the name Alembic gives a chapter's deck
//     (site_export sitePath; else Alembic files it as a loose page, not the chapter's slides); ATTRIBUTION.md's deck
//     paths follow, and each rename is reported.
// Then records_check (the chain and the review records the log binds: --records) must pass on the copy, exactly as
// Alembic will run it; SHA256SUMS lists every file, so Alembic's bring-in can tell a file changed on the way.
// Left out: .git, node_modules, the assembled carriers (.md.html, .slides.html, .paged.html: Alembic assembles its own),
// system files (.DS_Store, Thumbs.db, desktop.ini, __MACOSX) and every hidden file or folder (a name starting with ".",
// such as .env, .claude/, .vscode/, .gitignore) except Alembic's hand-out note (.alembic/handout.json) and Coursewerk's
// host record (.coursewerk-host.json). The size limits are Alembic's: they are reported, never enforced.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { RECORDS, PUBLIC_RECORDS } from "../records/paths.mjs";
import { HOST_FILE, readHostRecord } from "../records/host.mjs";
import { checkRecords, readJoinedLog } from "../records/records_check.mjs";
import { handbackSite } from "./site_host.mjs";
import { ROLL_BYTES, logParts, verificationLines } from "./site_export.mjs";
import { isCarrierPath } from "../contract.mjs";

export const ALEMBIC_HOST = "https://alembic.orz.how";
/** Alembic's hand-out note inside a folder it handed to a computer: { alembic: "handout", course, handout, title, at }. */
export const HANDOUT_NOTE = ".alembic/handout.json";
const PACKAGE_ID = /^[a-z0-9-]{1,200}$/;
// Alembic's limits at the time of writing (Alembic owns them; reported as warnings only): course-zip.ts, handout.ts,
// course-import.ts (a file at most MAX_UPLOAD_BYTES, 4,000,000 bytes; a record file on a hand-back, largeRecords, 16 MB)
const LIMITS = { zipBytes: 100 * 1024 * 1024, unpackedBytes: 200 * 1024 * 1024, bringInFiles: 5000, bringBackFiles: 20000, pageBytes: 4_000_000, bringBackRecordBytes: 16 * 1024 * 1024 };
const SKIP_NAMES = new Set([".git", "node_modules", ".DS_Store", "Thumbs.db", "desktop.ini", "__MACOSX"]);
/** The only hidden paths that go: Alembic's hand-out note and Coursewerk's host record (and the folder holding the note). */
const KEEP_HIDDEN = new Set([HANDOUT_NOTE, HOST_FILE]);
const MB = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const posix = (p) => p.split(path.sep).join("/");

/** The Alembic address to use: --host, else COURSEWERK_ALEMBIC_URL, else Alembic's own. Only an https origin (or http
 *  on this computer, for a local Alembic) is accepted. */
export function alembicHost(given = process.env.COURSEWERK_ALEMBIC_URL) {
  const raw = String(given || ALEMBIC_HOST).trim().replace(/\/+$/, "");
  let u; try { u = new URL(raw); } catch { throw new Error(`${JSON.stringify(raw)} is not an address (expected e.g. ${ALEMBIC_HOST})`); }
  const local = u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if ((u.protocol !== "https:" && !local) || u.username || u.password || (u.pathname !== "/" && u.pathname !== "") || u.search || u.hash)
    throw new Error(`${JSON.stringify(raw)} is not an Alembic address: give its origin only, e.g. ${ALEMBIC_HOST}`);
  return u.origin;
}

/** Alembic's hand-out note of a folder: { course, handout } or null when there is none; throws when it is unreadable. */
export function handoutNote(root) {
  const file = path.join(root, HANDOUT_NOTE);
  if (!fs.existsSync(file)) return null;
  let n; try { n = JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw new Error(`${HANDOUT_NOTE} cannot be read: Alembic would refuse this folder as damaged. Download the folder again from the course's page`); }
  if (!n || n.alembic !== "handout" || typeof n.course !== "string" || !PACKAGE_ID.test(n.course))
    throw new Error(`${HANDOUT_NOTE} is not Alembic's hand-out note: Alembic would refuse this folder as damaged. Download the folder again from the course's page`);
  return { course: n.course, handout: n.handout ?? null, title: typeof n.title === "string" ? n.title : null };
}

/** A course's page on Alembic, at its "On my computer" panel. */
export const coursePage = (host, course) => `${host}/workspace/${course}/course#on-my-computer`;

/** The files that go, sorted (posix paths). `hidden` collects the hidden paths left out (outermost only). */
function filesOf(dir, base = dir, hidden = []) {
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !SKIP_NAMES.has(e.name)).sort((a, b) => (a.name < b.name ? -1 : 1)).flatMap((e) => {
    const full = path.join(dir, e.name), rel = posix(path.relative(base, full));
    // a hidden path (any part of it starting with "."): only the two kept files, and the folder holding the note
    if (rel.split("/").some((seg) => seg.startsWith(".")) && !KEEP_HIDDEN.has(rel) && !(e.isDirectory() && [...KEEP_HIDDEN].some((k) => k.startsWith(`${rel}/`)))) { hidden.push(rel); return []; }
    if (e.isSymbolicLink()) throw new Error(`${rel} is a link: Alembic refuses a zip holding links; replace it with the file itself`);
    if (e.isDirectory()) return filesOf(full, base, hidden);
    return e.isFile() ? [rel] : [];
  });
}

const VER = `${RECORDS}/verification`;
const LOG_PART = /^LOG(?:\.\d+)?\.jsonl$/;
/** What of the folder's records is not yet as Alembic holds them: { log } a decision log part over ROLL_BYTES (to be
 *  cut); { verification } a review record held as its own file, or a folder under verification/ (to be wrapped onto the
 *  monthly .jsonl parts). Neither: the records go as they are. */
function conversionNeeds(root) {
  const vdir = path.join(root, VER), priv = path.join(root, RECORDS);
  const verification = fs.existsSync(vdir) && fs.statSync(vdir).isDirectory() && fs.readdirSync(vdir, { withFileTypes: true }).some((e) => !e.name.startsWith(".") && (e.isDirectory() || e.name.endsWith(".json")));
  const log = fs.existsSync(priv) && fs.readdirSync(priv).some((n) => LOG_PART.test(n) && fs.statSync(path.join(priv, n)).size > ROLL_BYTES);
  return { log, verification };
}
const escapeRe = (x) => x.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
/** A chapter deck under its old name (slides/<ch>.md) when the folder has no slides/<ch>.slides.md: the name it goes as. */
const deckRename = (rel, has) => (/^slides\/[^/]+(?<!\.slides)\.md$/.test(rel) && !has(rel.replace(/\.md$/, ".slides.md")) ? rel.replace(/\.md$/, ".slides.md") : null);

/**
 * Prepare `root` for Alembic: the zip (in `out`, default the folder's parent) and the page where the instructor sends it.
 * Returns { zip, bytes, files, mode: "bring-back" | "bring-in", course, link, records, handedBack, renamed: [{ from, to }],
 * warnings }. Throws, writing no
 * zip, when the folder cannot be sent as it is (the reason in plain words).
 */
export function prepareSend(root, { out = null, host = undefined, name = null } = {}) {
  root = path.resolve(root);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`no such folder: ${root}`);
  const origin = alembicHost(host);
  const outDir = path.resolve(out || path.dirname(root));
  const rel = path.relative(root, outDir);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) throw new Error("the zip must be written outside the course folder (--out)");
  if (fs.existsSync(path.join(root, RECORDS, "LOG.jsonl.lock"))) throw new Error("a writer holds the decision log (LOG.jsonl.lock): wait for it to finish, then send");
  if (!fs.existsSync(path.join(root, RECORDS, "LOG.jsonl")))
    throw new Error(`${RECORDS}/LOG.jsonl is missing: this folder holds no Coursewerk course to send (a course without Coursewerk records can be zipped and brought in as it is)`);
  const note = handoutNote(root);
  const host0 = readHostRecord(root);
  if (host0?.error) throw new Error(`${host0.error}: download the folder again from the course's page and import it again`);
  const imported = host0?.state === "imported";
  const needs = conversionNeeds(root);
  if (!imported && note && (needs.log || needs.verification))
    throw new Error(`this folder came from Alembic but its records are not as Alembic handed them out, and it was never imported (no ${HOST_FILE}): Coursewerk cannot tell what Alembic holds. Download the folder again, run site_import.mjs on it, and redo the work there`);
  const mode = note ? "bring-back" : "bring-in";

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-send-"));
  try {
    const staged = path.join(work, "course");
    const warnings = [];
    // the copy: everything but what never goes (the carriers, which Alembic assembles itself; hidden files)
    const hidden = [];
    const all = filesOf(root, root, hidden);
    const carriers = all.filter((f) => isCarrierPath(f));
    if (carriers.length) warnings.push(`${carriers.length} assembled file(s) left out (${carriers.slice(0, 3).join(", ")}${carriers.length > 3 ? ", …" : ""}): Alembic assembles its own`);
    if (hidden.length) warnings.push(`${hidden.length} hidden file(s) or folder(s) left out (${hidden.slice(0, 5).join(", ")}${hidden.length > 5 ? ", …" : ""}): a course sends no hidden files but Alembic's hand-out note and Coursewerk's host record`);
    // records not yet as Alembic holds them are converted below (not in a hand-back: handbackSite does it against the host record)
    const cutLog = !imported && needs.log, wrapVer = !imported && needs.verification;
    const has = new Set(all), renamed = [];
    for (const f of all) {
      if (isCarrierPath(f)) continue;
      if (cutLog && f.startsWith(`${RECORDS}/`) && !f.slice(RECORDS.length + 1).includes("/") && LOG_PART.test(f.slice(RECORDS.length + 1))) continue;
      if (wrapVer && f.startsWith(`${VER}/`)) continue;
      const to = deckRename(f, (x) => has.has(x));
      if (to) renamed.push({ from: f, to });
      const dest = path.join(staged, to || f);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(root, f), dest);
    }
    fs.mkdirSync(staged, { recursive: true });
    const write = (rel, data) => { const dest = path.join(staged, rel); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, data); };
    if (cutLog) {
      const joined = readJoinedLog(root);
      if (joined.problems.length) throw new Error(`the decision log cannot be read, so no zip was made:\n  - ${joined.problems.join("\n  - ")}`);
      for (const [rel, text] of Object.entries(logParts(joined.text))) write(`${RECORDS}/${rel}`, text);
    }
    if (wrapVer) for (const [rel, text] of Object.entries(verificationLines(root))) write(`${RECORDS}/${rel}`, text);
    // the decks renamed in the copy: the attribution names them as they go (as site_export does)
    const attribution = path.join(staged, PUBLIC_RECORDS, "ATTRIBUTION.md");
    if (renamed.length && fs.existsSync(attribution)) {
      let text = fs.readFileSync(attribution, "utf8");
      for (const { from, to } of renamed) text = text.replace(new RegExp("(?<![\\w./-])" + escapeRe(from) + "(?![\\w.])", "g"), to);
      fs.writeFileSync(attribution, text);
    }
    if (renamed.length) warnings.push(`${renamed.length} deck(s) go under the name Alembic gives a chapter's deck: ${renamed.map((r) => `${r.from} as ${r.to}`).join(", ")}. To rename them in this folder too: git mv each one, then node scripts/records_paths.mjs --root <folder>`);
    if (imported) { try { handbackSite(staged); } catch (e) { throw new Error(`this folder cannot be handed back, so no zip was made: ${e.message}`); } }
    // the check Alembic runs, on exactly what goes: the log's chain and the review records it binds
    const check = checkRecords(staged, { records: true });
    if (!check.ok) throw new Error(`the records check refuses this course, so no zip was made:\n  - ${check.problems.join("\n  - ")}`);

    // SHA256SUMS: every file, so a file changed on the way is told (Alembic's bring-in checks it; a hand-back drops it)
    fs.rmSync(path.join(staged, "SHA256SUMS"), { force: true });
    const files = filesOf(staged);
    let unpacked = 0;
    // a record file may be larger on a hand-back (16 MB) than on a bring-in (4 MB, as any file)
    const recordMost = mode === "bring-back" ? LIMITS.bringBackRecordBytes : LIMITS.pageBytes;
    const sums = files.map((f) => {
      const b = fs.readFileSync(path.join(staged, f)); unpacked += b.length;
      const record = f.startsWith(`${RECORDS}/`) || f.startsWith(`${PUBLIC_RECORDS}/`);
      if (b.length > (record ? recordMost : LIMITS.pageBytes)) warnings.push(`${f} is ${MB(b.length)}: Alembic leaves out a ${record ? "record " : ""}file over ${record && mode === "bring-back" ? "16" : "4"} MB`);
      return `${crypto.createHash("sha256").update(b).digest("hex")}  ./${f}\n`;
    }).join("");
    fs.writeFileSync(path.join(staged, "SHA256SUMS"), sums);
    if (mode === "bring-in" && host0) warnings.push(`this folder came from Alembic (${HOST_FILE}) but holds no hand-out note (${HANDOUT_NOTE}): bringing it in makes a new course beside the one it came from`);
    const most = mode === "bring-in" ? LIMITS.bringInFiles : LIMITS.bringBackFiles;
    if (files.length + 1 > most) warnings.push(`${files.length + 1} files: Alembic takes at most ${most} at once`);
    if (unpacked > LIMITS.unpackedBytes) warnings.push(`${MB(unpacked)} in all: Alembic takes at most ${MB(LIMITS.unpackedBytes)} unpacked`);

    fs.mkdirSync(outDir, { recursive: true });
    const zip = path.join(outDir, name || `${path.basename(root)}.to-alembic.zip`);
    fs.rmSync(zip, { force: true });
    const z = spawnSync("zip", ["-r", "-q", "-X", "-D", zip, "."], { cwd: staged, encoding: "utf8" });
    if (z.error || z.status !== 0) throw new Error(`zip failed: ${z.error?.message || z.stderr || z.stdout}`);
    const bytes = fs.statSync(zip).size;
    if (bytes > LIMITS.zipBytes) warnings.push(`the zip is ${MB(bytes)}: Alembic takes at most ${MB(LIMITS.zipBytes)} at once`);
    return {
      zip, bytes, files: files.length + 1, mode, course: note?.course ?? null,
      link: note ? coursePage(origin, note.course) : `${origin}/workspace`,
      records: { log: check.log.records, reviews: check.records.records, logged: check.records.logged },
      handedBack: imported, renamed, warnings,
    };
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

/** What the instructor does to send the zip: plain steps, in Alembic's words. */
export function sendSteps(r) {
  const file = path.basename(r.zip);
  return r.mode === "bring-back"
    ? [`Open ${r.link}`, `Under "On your computer since …", choose the file ${file} (it is in ${path.dirname(r.zip)}).`, `Look at what it would bring, then press "Bring it back".`]
    : [`Open ${r.link}`, `Open "Bring in a course from my computer" and choose the file ${file} (it is in ${path.dirname(r.zip)}).`, `Press "Bring in".`];
}

/**
 * Taking a course from Alembic to this computer: the course's page (from --course, the folder's hand-out note, or its
 * alembic.json packageId) and the steps. Alembic hands a course out only to its owner's own browser.
 */
export function takeSteps({ root = null, course = null, host = undefined, harness = "<harness>" } = {}) {
  const origin = alembicHost(host);
  let id = course;
  if (!id && root) id = handoutNote(root)?.course ?? null;
  if (!id && root) { try { const m = JSON.parse(fs.readFileSync(path.join(root, "alembic.json"), "utf8")); if (typeof m.packageId === "string" && PACKAGE_ID.test(m.packageId) && m.packageId !== "pending") id = m.packageId; } catch { /* no manifest: the course is chosen on Alembic */ } }
  if (id != null && !PACKAGE_ID.test(id)) throw new Error(`${JSON.stringify(id)} is not an Alembic course id (lowercase letters, digits and dashes)`);
  const link = id ? coursePage(origin, id) : `${origin}/workspace`;
  return {
    course: id, link,
    steps: [
      id ? `Open ${link}` : `Open ${link} and open the course`,
      `Under "Work on it on your computer", press "Hand to my computer" (if it is already out: "Download the folder again"). The course comes as one zip.`,
      "Unzip it, and work in the course's folder (not the \"… - my sources\" folder beside it).",
      `Before any Coursewerk command: node ${harness}/scripts/site_import.mjs <folder>`,
      `When done: node ${harness}/scripts/alembic_transfer.mjs send --root <folder>, then bring it back on the same page.`,
    ],
  };
}
