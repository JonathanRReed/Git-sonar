#!/usr/bin/env node
// Bun before 1.4.3 has no type checker: `bun --check` prints help and exits 0.
// This runs the checker only on a verified Bun at or above the packageManager pin,
// and treats exit 0 without Bun's "No type errors in N files" summary as a failure.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { stripVTControlCharacters } from "node:util";

const CHECKER_FLOOR = [1, 4, 3];

/** @param {string} message */
function fail(message) {
  process.stderr.write(`bun-check: ${message}\n`);
  process.exitCode = 1;
}

/** @param {string} text */
function parseVersion(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
  return match ? match.slice(1, 4).map(Number) : null;
}

/** @param {number[]} a @param {number[]} b */
function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function findPackageManagerPin() {
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    const file = join(dir, "package.json");
    if (existsSync(file)) {
      const { packageManager } = JSON.parse(readFileSync(file, "utf8"));
      if (packageManager !== undefined) return String(packageManager);
    }
    if (dirname(dir) === dir) return fail("no package.json with a packageManager field found from the current directory upward");
  }
}

function main() {
  const packageManager = findPackageManagerPin();
  if (packageManager === undefined) return;
  const pinText = /^bun@(.+)$/.exec(packageManager)?.[1] ?? "";
  const pin = parseVersion(pinText);
  if (!pin) return fail(`package.json packageManager must be "bun@<x.y.z>", found ${JSON.stringify(packageManager)}`);
  if (compare(pin, CHECKER_FLOOR) < 0) return fail(`packageManager pins bun@${pinText}, but the type checker needs Bun ${CHECKER_FLOOR.join(".")}+`);

  const bun = process.versions.bun ? process.execPath : "bun";
  const probe = spawnSync(bun, ["--version"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) return fail(`could not run ${bun} --version: ${probe.error?.message ?? `exit ${probe.status}`}`);
  const found = parseVersion(probe.stdout);
  if (!found) return fail(`${bun} --version printed ${JSON.stringify(probe.stdout.trim())}, not a Bun release version; install bun@${pinText}`);
  if (compare(found, pin) < 0) return fail(`${bun} is Bun ${found.join(".")}; this project pins bun@${pinText}. Install it (https://bun.com/docs/installation) and retry.`);

  const child = spawn(bun, ["--check", ...process.argv.slice(2)], { stdio: ["inherit", "pipe", "pipe"] });
  let checkedFiles = false;
  for (const [source, sink] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    let summaryTail = "";
    source.on("data", (chunk) => {
      const text = summaryTail + chunk.toString();
      checkedFiles ||= /No type errors in [1-9]\d* files?\b/.test(stripVTControlCharacters(text));
      summaryTail = text.slice(-4096);
    });
    source.pipe(sink, { end: false });
  }
  child.on("error", (error) => fail(`could not start ${bun} --check: ${error.message}`));
  child.on("close", (code, signal) => {
    if (code !== 0) {
      process.exitCode = code ?? 1;
      return;
    }
    if (!checkedFiles) fail(`${bun} --check exited ${code ?? signal} without reporting checked files; not treating it as a passing type check`);
  });
}

main();
