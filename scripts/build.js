#!/usr/bin/env node
'use strict';

/**
 * Build script for Node.js Single Executable Application (SEA)
 * with Puppeteer + bundled chrome-headless-shell.
 *
 * Steps:
 * 1. Bundle src/cli.js (and puppeteer) into a single CommonJS file with esbuild
 * 2. Generate SEA preparation blob from the bundle
 * 3. Copy Node binary and inject the blob with postject
 * 4. Unzip vendored chrome-headless-shell into dist/chrome/ (for distribution)
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const BUNDLE = path.join(DIST, 'bundle.js');
const CONFIG = path.join(ROOT, 'sea-config.json');
const BLOB = path.join(DIST, 'sea-prep.blob');

// Parse --target windows|linux (default: current platform)
const args = process.argv.slice(2);
let target = process.platform === 'win32' ? 'windows' : 'linux';
const targetIdx = args.indexOf('--target');
if (targetIdx !== -1 && args[targetIdx + 1]) {
  target = args[targetIdx + 1].toLowerCase();
}
if (!['windows', 'linux'].includes(target)) {
  console.error('Invalid --target. Use "windows" or "linux".');
  process.exit(1);
}

const isWindowsTarget = target === 'windows';
const binaryName = isWindowsTarget ? 'myBinary.exe' : 'myBinary';
const OUTPUT = path.join(DIST, binaryName);

// Resolve Node binary for the target:
// 1. SEA_NODE_EXECUTABLE env var (explicit override)
// 2. Vendored zip in vendor/ (auto-extracted)
// 3. null → use current process.execPath (native build)
async function resolveNodeExecutable(target) {
  if (process.env.SEA_NODE_EXECUTABLE) {
    return process.env.SEA_NODE_EXECUTABLE;
  }

  const binName = target === 'windows' ? 'node.exe' : 'node';
  const binDir = path.join(ROOT, 'bin');

  if (!fs.existsSync(binDir)) {
    console.error(`bin/ not found: ${binDir}`);
    return null;
  }

  console.log(`Looking for Node binary in: ${binDir}`);
  const files = fs.readdirSync(binDir);

  // Prefer a standalone binary named like node-v*-linux-x64 (no extension)
  if (target === 'linux') {
    const standalone = files.find((f) => /^node-v[\d.]+-linux(-x64)?$/i.test(f));
    if (standalone) {
      const p = path.join(binDir, standalone);
      if (fs.statSync(p).isFile()) {
        console.log(`Using Node binary: ${p}`);
        return p;
      }
    }
  }

  // Fallback: walk for a file named node / node.exe
  function findBinary(dir, depth = 0) {
    if (depth > 4 || !fs.existsSync(dir)) return null;
    try {
      const direct = path.join(dir, binName);
      if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
      const inBin = path.join(dir, 'bin', binName);
      if (fs.existsSync(inBin) && fs.statSync(inBin).isFile()) return inBin;
      for (const entry of fs.readdirSync(dir)) {
        const sub = path.join(dir, entry);
        if (fs.statSync(sub).isDirectory()) {
          const found = findBinary(sub, depth + 1);
          if (found) return found;
        }
      }
    } catch { /* ignore */ }
    return null;
  }

  const found = findBinary(binDir);
  if (found) {
    console.log(`Using Node binary: ${found}`);
    return found;
  }

  console.error(`No Node binary found under bin/`);
  console.error('Expected a file like bin/node-v24.16.0-linux-x64 (standalone) or bin/node');
  return null;
}

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
}

async function main() {
  // Clean dist/ before building
  if (fs.existsSync(DIST)) {
    console.log('Cleaning dist/...');
    fs.rmSync(DIST, { recursive: true, force: true });
  }

  const NODE_EXECUTABLE = await resolveNodeExecutable(target);

  fs.mkdirSync(DIST, { recursive: true });

  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  console.log(`Node.js ${process.version} detected`);
  console.log(`Target platform: ${target}`);

  const isCrossCompile = (target === 'windows' && process.platform !== 'win32') ||
                         (target === 'linux' && process.platform === 'win32');

  if (isCrossCompile && !NODE_EXECUTABLE) {
    console.error('\nCross-compile detected but no Node binary found for the target.');
    console.error('Either:');
    console.error('  1. Place a standalone Node binary in bin/');
    console.error('     (e.g. bin/node-v24.16.0-linux-x64)');
    console.error('  2. Or set SEA_NODE_EXECUTABLE to the node binary path.');
    process.exit(1);
  }

  if (NODE_EXECUTABLE && !fs.existsSync(NODE_EXECUTABLE)) {
    console.error(`SEA_NODE_EXECUTABLE not found: ${NODE_EXECUTABLE}`);
    process.exit(1);
  }

  // 1. Bundle application (required so puppeteer is inside the SEA)
  console.log('Bundling application with esbuild...');
  try {
    require.resolve('esbuild');
  } catch {
    console.error('esbuild not found. Run: npm install');
    process.exit(1);
  }

  // Bundle with esbuild. Mark optional/peer deps that are only required dynamically as external
  // so the build doesn't fail on missing optional packages (e.g. typescript in cosmiconfig).
  const externals = [
    'node:sea',
    'typescript',
    '@swc/core',
    'esbuild',
  ].map((e) => `--external:${e}`).join(' ');

  run(`npx esbuild src/cli.js --bundle --platform=node --target=node20 --outfile="${BUNDLE}" ${externals}`);

  // Update sea-config for this build
  const seaConfig = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  seaConfig.main = BUNDLE;
  if (NODE_EXECUTABLE) {
    seaConfig.executable = NODE_EXECUTABLE;
  } else {
    delete seaConfig.executable;
  }
  // Disable code cache / snapshot when cross-compiling
  if (isCrossCompile) {
    seaConfig.useCodeCache = false;
    seaConfig.useSnapshot = false;
  }
  const tempConfig = path.join(DIST, 'sea-config-build.json');
  fs.writeFileSync(tempConfig, JSON.stringify(seaConfig, null, 2));

  if (nodeMajor >= 25) {
    console.log('\nModern flow available (--build-sea).');
    console.log('For one-step builds, point sea-config "output" at the final binary and run:');
    console.log('  node --build-sea sea-config.json');
    if (process.platform === 'darwin') {
      console.log('  codesign --sign - dist/' + binaryName);
    }
    console.log('\nFalling back to classic flow for compatibility...\n');
  }

  // 2. Generate preparation blob
  console.log('Generating SEA preparation blob...');
  run(`node --experimental-sea-config "${tempConfig}"`);

  if (!fs.existsSync(BLOB)) {
    console.error('Blob was not generated. Check sea-config.json');
    process.exit(1);
  }

  // 3. Copy Node binary (target platform binary if cross-compiling)
  console.log('Copying Node.js binary...');
  const sourceBinary = NODE_EXECUTABLE || process.execPath;
  fs.copyFileSync(sourceBinary, OUTPUT);
  if (!isWindowsTarget) {
    try { fs.chmodSync(OUTPUT, 0o755); } catch { /* sandbox or Windows may block */ }
  }

  // 4. Inject blob with postject
  console.log('Injecting blob with postject...');
  const postjectArgs = [
    `"${OUTPUT}"`,
    'NODE_SEA_BLOB',
    `"${BLOB}"`,
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ];

  try {
    const postjectCli = path.join(ROOT, 'node_modules', 'postject', 'dist', 'cli.js');
    run(`node "${postjectCli}" ${postjectArgs.join(' ')}`);
  } catch (err) {
    console.error('\npostject failed. Install it with: npm install');
    process.exit(1);
  }

  // 5. macOS re-sign (only relevant if building a macOS binary)
  if (process.platform === 'darwin' && target !== 'windows' && target !== 'linux') {
    console.log('Re-signing binary for macOS...');
    try {
      run(`codesign --sign - "${OUTPUT}"`);
    } catch {
      console.warn('codesign failed — binary may need manual signing on macOS');
    }
  }

  // 6. Unzip vendored chrome-headless-shell for the target platform
  console.log('Preparing vendored chrome-headless-shell...');
  try {
    run(`node scripts/prepare-chrome.js --target ${target}`);
  } catch (err) {
    console.warn('Chrome preparation failed. Ensure the correct zip exists in bin/.');
  }

  // 7. Done
  console.log('\n✅ Build complete!');
  console.log(`Binary: ${OUTPUT}`);
  console.log(`Chrome: ${path.join(DIST, 'chrome')} (if present)`);
  console.log(`Size: ${(fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1)} MB`);
  console.log('\nDistribution package should contain:');
  console.log(`  ${binaryName}`);
  console.log('  chrome/   (chrome-headless-shell tree)');
  console.log('\nTest:');
  console.log(`  ${OUTPUT} --version`);
  console.log(`  ${OUTPUT} pdf sample.pdf`);
}

main().catch((err) => { console.error(err); process.exit(1); });
