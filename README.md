# Node.js Single Executable Application (SEA) CLI

Self-contained binary that renders PDFs with Puppeteer using **chrome-headless-shell** only. All required binaries are placed as archives in `bin/` — no external downloads during build.

## Setup

```bash
npm install
```

## Required downloads (place in `bin/`)

All archives go directly in the `bin/` folder (flat layout).

### chrome-headless-shell

From https://googlechromelabs.github.io/chrome-for-testing/ (section: **chrome-headless-shell**)

| File | Platform |
|------|----------|
| `chrome-headless-shell-win64.zip` | Windows |
| `chrome-headless-shell-linux64.zip` | Linux x64 |
| `chrome-headless-shell-linux-arm64.zip` | Linux ARM64 |

### Node.js (cross-compile only)

From https://nodejs.org/dist/

| File | When needed |
|------|-------------|
| `node-v24.13.1-linux-x64.tar.gz` | Building a Linux binary on Windows |

A Windows Node archive is not required when you are already on Windows.

### Layout

```
bin/
  chrome-headless-shell-win64.zip
  chrome-headless-shell-linux64.zip
  chrome-headless-shell-linux-arm64.zip
  node-v24.13.1-linux-x64.tar.gz
```

## Build

```bash
npm run build                 # current OS
npm run build:windows
npm run build:linux
```

The build unzips the matching chrome-headless-shell into `dist/chrome/` next to the binary.

## Usage

```bash
./dist/myBinary pdf report.pdf
```

The binary uses only `chrome-headless-shell`. Override with `PUPPETEER_EXECUTABLE_PATH` if needed.
