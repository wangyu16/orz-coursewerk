// Guard: committed source must contain no C0 control characters (tab/CR/LF excepted).
//
// WHY THIS EXISTS — a real defect, not a hypothetical. While authoring lib/escalation.mjs, literal
// NUL (U+0000) and U+0001 bytes were written as internal Map-key delimiters. The module was
// FUNCTIONALLY CORRECT and its whole suite passed: the bytes never escaped the key space. But the
// file was BINARY to grep, diff, and git's review tooling, and an editor renders NUL as a space —
// so the corruption was invisible in the editor, silently broke exact-match edits against the file,
// and would have shipped a file no reviewer could search.
//
// It is worth a standing test precisely BECAUSE the existing suite could never catch it: tests
// exercise BEHAVIOR, and this defect lives entirely in the artifact's READABILITY. Cheap to check,
// impossible to notice by eye, and it costs the next person an afternoon of "why does grep say this
// file is empty?" (it did — twice, counting the author of this file, who reproduced the exact bug
// while writing the guard against it and could not then edit their own file to fix it).
//
// NOTE TO ANYONE EDITING THIS FILE: every control character here is written as an ESCAPE
// (\x00, never the raw byte) — including in comments and test fixtures. A guard that contains the
// thing it forbids fails itself, and the raw byte is exactly as invisible here as anywhere else.
// Delimiters inside code should be visibly printable (e.g. "|") for the same reason.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Tab (\x09), LF (\x0A), CR (\x0D) are legitimate text. Everything else in C0 is not.
const FORBIDDEN = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

function trackedSourceFiles() {
  const out = execFileSync("git", ["ls-files", "-z", "*.mjs", "*.js", "*.json", "*.md"], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return out.split("\x00").filter(Boolean);
}

test("no C0 control characters in tracked source (tab/CR/LF excepted)", () => {
  const offenders = [];

  for (const rel of trackedSourceFiles()) {
    let text;
    try {
      text = readFileSync(join(REPO, rel), "utf8");
    } catch {
      continue; // deleted-but-tracked, or unreadable; not this test's business
    }
    if (!FORBIDDEN.test(text)) continue;

    // Report the location, not just the file — a bare filename sends the next person
    // hunting for a character they cannot see.
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const col = lines[i].search(FORBIDDEN);
      if (col === -1) continue;
      const code = lines[i].codePointAt(col).toString(16).padStart(4, "0");
      offenders.push(`${rel}:${i + 1}:${col + 1} — U+${code.toUpperCase()}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Control characters found in tracked source. They are invisible in an editor and make the file ` +
      `binary to grep/diff. Use a printable delimiter instead:\n  ${offenders.join("\n  ")}`
  );
});

test("the guard actually detects a control character (it must fail on the real thing)", () => {
  // A guard nobody has seen fail is a guard nobody knows works. Assert against the exact bytes
  // that caused the incident, and against the exemptions that must NOT trip it.
  assert.equal(FORBIDDEN.test("key\x00value"), true, "must catch NUL");
  assert.equal(FORBIDDEN.test("key\x01value"), true, "must catch U+0001");
  assert.equal(FORBIDDEN.test("a\tb\r\nc"), false, "tab/CR/LF are legitimate text");
  assert.equal(FORBIDDEN.test("plain source"), false, "must not fire on ordinary text");
});
