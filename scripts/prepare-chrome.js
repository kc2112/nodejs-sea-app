#!/usr/bin/env node
'use strict';

/**
 * Unzips the vendored Chrome archive for the target platform into dist/chrome/.
 * Uses PowerShell Expand-Archive on Windows (no system tar required).
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor', 'chrome');
const DIST_CHROME = path.join(ROOT, 'dist', 'chrome');

const args = process.argv.slice(2);
let target = process.platform === 'win32' ? 'windows' : 'linux';
const targetIdx = args.indexOf('--target');
if (targetIdx !== -1 && args[targetIdx + 1]) {
  target = args[targetIdx + 1].toLowerCase();
}

function findChromeZip(target) {
  if (!fs.existsSync(VENDOR)) return null;
  const files = fs.readdirSync(VENDOR);
  const lower = files.map((f) => ({ name: f, lower: f.toLowerCase() }));

  if (target === 'windows') {
    const hit = lower.find((f) => f.lower.includes('win') && f.lower.endsWith('.zip'));
    return hit ? path.join(VENDOR, hit.name) : null;
  }
  const arm = lower.find((f) => f.lower.includes('linux') && f.lower.includes('arm') && f.lower.endsWith('.zip'));
  if (arm) return path.join(VENDOR, arm.name);
  const anyLinux = lower.find((f) => f.lower.includes('linux') && f.lower.endsWith('.zip'));
  return anyLinux ? path.join(VENDOR, anyLinux.name) : null;
}

function unzip(zip, dest) {
  fs.mkdirSync(dest, { recursive: true });
  if (process.platform === 'win32') {
    execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zip}' -DestinationPath '${dest}' -Force"`, { stdio: 'inherit' });
  } else {
    execSync(`unzip -o "${zip}" -d "${dest}"`, { stdio: 'inherit' });
  }
}

function main() {
  const zipPath = findChromeZip(target);
  if (!zipPath) {
    console.error(`No Chrome zip found in ${VENDOR} for target "${target}"`);
    console.error('Expected something like chrome-win64.zip or chrome-linux64.zip / chrome-linux-arm64.zip');
    process.exit(1);
  }

  console.log(`Unzipping ${path.basename(zipPath)} → ${DIST_CHROME}`);

  if (fs.existsSync(DIST_CHROME)) {
    fs.rmSync(DIST_CHROME, { recursive: true, force: true });
  }

  const tmp = path.join(ROOT, 'dist', 'chrome-tmp');
  if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  unzip(zipPath, tmp);

  const entries = fs.readdirSync(tmp);
  if (entries.length === 1 && fs.statSync(path.join(tmp, entries[0])).isDirectory()) {
    fs.renameSync(path.join(tmp, entries[0]), DIST_CHROME);
    fs.rmdirSync(tmp);
  } else {
    fs.renameSync(tmp, DIST_CHROME);
  }

  console.log('Chrome ready at dist/chrome/');
}

main();
