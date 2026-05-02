# Changelog

## 0.1.1 (2026-05-02)

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-01

### Added

- Interactive D3.js treemap of React Native bundle composition
- Zero-config: auto-detects project root, entry file, and metro.config.js
- Metro serializer hook for accurate per-module byte sizes (no source map parsing)
- Works with RN 0.73+, New Architecture (RN 0.82+), bare and Expo projects
- Supports iOS and Android platforms
- Self-contained HTML report (no internet required, shareable by file)
- Search, click-to-detail sidebar, hover tooltips
- Flags: `-p/--platform`, `-o/--out`, `--dev`, `--reset-cache`, `--no-open`
- Windows path support in module name extraction
- Expo Router entry point auto-detection
