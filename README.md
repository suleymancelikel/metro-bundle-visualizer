# metro-bundle-visualizer

[![npm version](https://img.shields.io/npm/v/metro-bundle-visualizer?color=blue)](https://www.npmjs.com/package/metro-bundle-visualizer)
[![npm downloads](https://img.shields.io/npm/dw/metro-bundle-visualizer)](https://www.npmjs.com/package/metro-bundle-visualizer)
[![CI](https://github.com/suleymancelikel/metro-bundle-visualizer/actions/workflows/ci.yml/badge.svg)](https://github.com/suleymancelikel/metro-bundle-visualizer/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/suleymancelikel/metro-bundle-visualizer/branch/main/graph/badge.svg)](https://codecov.io/gh/suleymancelikel/metro-bundle-visualizer)
[![license](https://img.shields.io/npm/l/metro-bundle-visualizer)](LICENSE)

Interactive bundle size visualizer for React Native — works with RN 0.73+, New Architecture, zero config.

> **Drop-in replacement for `react-native-bundle-visualizer`**, which is broken on RN 0.82+ / Metro 0.83 due to invalid source map column references. This tool hooks into Metro's serializer directly — no source maps required.

<!-- demo GIF placeholder — add once tool is running against a real project -->

## Quick Start

```bash
npx metro-bundle-visualizer
```

Run from your React Native project root. An interactive HTML treemap opens in your browser.

## Installation

```bash
# one-off (recommended)
npx metro-bundle-visualizer

# or install globally
npm install -g metro-bundle-visualizer
```

## Usage

```
metro-bundle-visualizer [options]

Options:
  -p, --platform <ios|android>   Platform to bundle for (default: "ios")
  --dev                          Bundle in dev mode (default: false)
  --entry <path>                 Entry file (default: auto-detected from package.json "main")
  -o, --out <path>               Output HTML path (default: "./bundle-report.html")
  --no-open                      Don't open browser automatically
  --reset-cache                  Reset Metro cache before bundling
  -V, --version                  Print version
  -h, --help                     Show help
```

### Examples

```bash
# iOS production bundle (default)
npx metro-bundle-visualizer

# Android
npx metro-bundle-visualizer --platform android

# CI — save without opening browser
npx metro-bundle-visualizer --no-open --out ./reports/bundle.html
```

### Expected output

```
metro-bundle-visualizer v0.1.0

Project:  /your/rn/project
Entry:    index.js
Platform: ios
Mode:     production

Bundling…

Bundle complete — 44.3 MB (3241 modules)

Report saved to: ./bundle-report.html
Opened in browser.
```

## How It Works

Instead of post-processing source maps (broken on Metro 0.83+), this tool injects a custom serializer into Metro's bundling pipeline. Each module's `output[0].data.code` — the exact bytes Metro writes to the bundle — is captured and attributed to its package. The result is a self-contained HTML file with a D3.js treemap.

The bundle output is **never altered**.

## FAQ

**Does it work with Expo?**
Yes. For Expo projects, try `--entry node_modules/expo/AppEntry.js` if auto-detection doesn't pick up the right entry point.

**Does it work with New Architecture (Fabric / JSI)?**
Yes — this is the primary reason this tool exists. `react-native-bundle-visualizer` is broken on New Architecture; this tool is not.

**Can I use it in CI without opening a browser?**
Yes: `metro-bundle-visualizer --no-open --out ./bundle-report.html`

**Why are sizes slightly larger than the final binary?**
Sizes are post-Babel-transform but pre-Terser minification. Relative proportions are accurate; absolute KB values are ~20-40% larger than what ships in the final binary.

## React Native Version Support

| RN Version | Status |
|------------|--------|
| 0.83+ (New Architecture) | Supported |
| 0.73 – 0.82 | Supported |
| < 0.73 | Not tested |

Node.js 18, 20, and 22 are tested in CI across Ubuntu, macOS, and Windows.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
