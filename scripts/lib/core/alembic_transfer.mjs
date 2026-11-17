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
//   - a package made on the computer (a new course; no hand-out note) has its records cut as Alembic holds them: the
//     decision log in parts, the verification records in monthly .jsonl parts (site_export exportSite);
//   - a folder already in site layout goes as it is.
// Then records_check (the chain and the review records the log binds: --records) must pass on the copy, exactly as
// Alembic will run it; SHA256SUMS lists every file, so Alembic's bring-in can tell a file changed on the way.
// Left out: .git, node_modules, the assembled carriers (.md.html, .slides.html, .paged.html: Alembic assembles its own)
// and system files (.DS_Store, Thumbs.db, desktop.ini). The size limits are Alembic's: they are reported, never enforced.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { RECORDS, PUBLIC_RECORDS } from "../records/paths.mjs";
import { HOST_FILE, readHostRecord } from "../records/host.mjs";
import { checkRecords } from "../records/records_check.mjs";
import { handbackSite } from "./site_host.mjs";
import { exportSite } from "./site_export.mjs";
import { isCarrierPath } from "../contract.mjs";

export const ALEMBIC_HOST = "https://alembic.orz.how";
/** Alembic's hand-out note inside a folder it handed to a computer: { alembic: "handout", course, handout, title, at }. */
export const HANDOUT_NOTE = ".alembic/handout.json";
const PACKAGE_ID = /^[a-z0-9-]{1,200}$/;
// Alembic's limits at the time of writing (Alembic owns them; reported as warnings only): course-zip.ts, handout.ts
const LIMITS = { zipBytes: 100 * 1024 * 1024, unpackedBytes: 200 * 1024 * 1024, bringInFiles: 5000, bringBackFiles: 20000, pageBytes: 4 * 1024 * 1024 };
const SKIP_NAMES = new Set([".git", "node_modules", ".DS_Store", "Thumbs.db", "desktop.ini", "__MACOSX"]);
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

function filesOf(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !SKIP_NAMES.has(e.name)).sort((a, b) => (a.name < b.name ? -1 : 1)).flatMap((e) => {
    const full = path.join(dir, e.name), rel = posix(path.relative(base, full));
    if (e.isSymbolicLink()) throw new Error(`${rel} is a link: Alembic refuses a zip holding links; replace it with the file itself`);
    if (e.isDirectory()) return filesOf(full, base);
    return e.isFile() ? [rel] : [];
  });
}

/** Does the folder hold its review records as a package does (one file per record, or a log past one part)? */
function packageLayout(root) {
  const vdir = path.join(root, RECORDS, "verification");
  const ver = fs.existsSync(vdir) && fs.readdirSync(vdir, { withFileTypes: true }).some((e) => e.isDirectory() || e.name.endsWith(".json"));
  const log = path.join(root, RECORDS, "LOG.jsonl");
  return ver || (fs.existsSync(log) && fs.statSync(log).size > 3.5 * 1024 * 1024);
}

/**
 * Prepare `root` for Alembic: the zip (in `out`, default the folder's parent) and the page where the instructor sends it.
 * Returns { zip, bytes, files, mode: "bring-back" | "bring-in", course, link, records, warnings }. Throws, writing no
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
  if (!imported && note && packageLayout(root))
    throw new Error(`this folder came from Alembic but its records are not as Alembic handed them out, and it was never imported (no ${HOST_FILE}): Coursewerk cannot tell what Alembic holds. Download the folder again, run site_import.mjs on it, and redo the work there`);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "coursewerk-send-"));
  try {
    const staged = path.join(work, "course");
    const warnings = [];
    // the copy: everything but what never goes (and the carriers, which Alembic assembles itself)
    const all = filesOf(root);
    const carriers = all.filter((f) => isCarrierPath(f));
    if (carriers.length) warnings.push(`${carriers.length} assembled file(s) left out (${carriers.slice(0, 3).join(", ")}${carriers.length > 3 ? ", …" : ""}): Alembic assembles its own`);
    const convert = !imported && packageLayout(root);
    for (const f of all) {
      if (isCarrierPath(f)) continue;
      // a package's records are written below by exportSite, as Alembic holds them
      if (convert && (f.startsWith(`${RECORDS}/`) || f.startsWith(`${PUBLIC_RECORDS}/`)) && f !== `${PUBLIC_RECORDS}/CHECKED.json`) continue;
      const dest = path.join(staged, f);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(root, f), dest);
    }
    fs.mkdirSync(staged, { recursive: true });
    if (imported) { try { handbackSite(staged); } catch (e) { throw new Error(`this folder cannot be handed back, so no zip was made: ${e.message}`); } }
    else if (convert) {
      const r = exportSite(root, staged);
      // (CHECKED.json, built at publish, was copied as it is: exportSite rebuilds it only from a gate run)
      for (const p of r.problems) warnings.push(p);
    }
    // the check Alembic runs, on exactly what goes: the log's chain and the review records it binds
    const check = checkRecords(staged, { records: true });
    if (!check.ok) throw new Error(`the records check refuses this course, so no zip was made:\n  - ${check.problems.join("\n  - ")}`);

    // SHA256SUMS: every file, so a file changed on the way is told (Alembic's bring-in checks it; a hand-back drops it)
    fs.rmSync(path.join(staged, "SHA256SUMS"), { force: true });
    const files = filesOf(staged);
    let unpacked = 0;
    const sums = files.map((f) => { const b = fs.readFileSync(path.join(staged, f)); unpacked += b.length; if (b.length > LIMITS.pageBytes && !f.startsWith(`${RECORDS}/`) && !f.startsWith(`${PUBLIC_RECORDS}/`)) warnings.push(`${f} is ${MB(b.length)}: Alembic leaves out a file over 4 MB`); return `${crypto.createHash("sha256").update(b).digest("hex")}  ./${f}\n`; }).join("");
    fs.writeFileSync(path.join(staged, "SHA256SUMS"), sums);
    const mode = note ? "bring-back" : "bring-in";
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
      handedBack: imported, warnings,
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
