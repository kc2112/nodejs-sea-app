# Node.js Single Executable Application (SEA) CLI

Self-contained binary that renders PDFs with Puppeteer. All required binaries are vendored as archives — no external downloads during build.

## Setup

```bash
npm install
```

## Vendored archives (place in `vendor/`)

- `chrome-win64.zip` / `chrome-linux64.zip` — Chrome for Testing
- `node-linux-x64.tar.xz` / `node-win-x64.zip` — Node.js binaries for cross-compiles

See `vendor/README.md`.

## Build

```bash
npm run build                 # current OS
npm run build:windows
npm run build:linux           # uses vendored Node + Chrome if present
```

## Cross-compile Linux from Windows

```bash
npm run build:linux
```

Requires `vendor/node-linux-x64.tar.xz` and `vendor/chrome-linux64.zip`. The script extracts them automatically.

## Usage

```bash
./dist/myBinary pdf report.pdf
```
