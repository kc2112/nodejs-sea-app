#!/usr/bin/env node
'use strict';

/**
 * Unzips the vendored chrome-headless-shell archive for the target platform
 * into dist/chrome/. Only headless-shell zips are accepted.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin');
const DIST_CHROME = path.join(ROOT, 'dist', 'chrome');

const args = process.argv.slice(2);
let target = process.platform === 'win32' ? 'windows' : 'linux';
const targetIdx = args.indexOf('--target');
if (targetIdx !== -1 && args[targetIdx + 1]) {
  target = args[targetIdx + 1].toLowerCase();
}

function findChromeZip(target) {
  if (!fs.existsSync(BIN)) return null;
  const files = fs.readdirSync(BIN);
  const lower = files.map((f) => ({ name: f, lower: f.toLowerCase() }));

  const shell = lower.filter((f) => f.lower.includes('headless-shell') && f.lower.endsWith('.zip'));

  if (target === 'windows') {
    const hit = shell.find((f) => f.lower.includes('win'));
    return hit ? path.join(BIN, hit.name) : null;
  }
  const arm = shell.find((f) => f.lower.includes('linux') && f.lower.includes('arm'));
  if (arm) return path.join(BIN, arm.name);
  const anyLinux = shell.find((f) => f.lower.includes('linux'));
  return anyLinux ? path.join(BIN, anyLinux.name) : null;
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
    console.error(`No chrome-headless-shell zip found in ${BIN} for target "${target}"`);
    console.error('Expected something like:');
    console.error('  chrome-headless-shell-win64.zip');
    console.error('  chrome-headless-shell-linux64.zip');
    console.error('  chrome-headless-shell-linux-arm64.zip');
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

  console.log('chrome-headless-shell ready at dist/chrome/');
}

main();
