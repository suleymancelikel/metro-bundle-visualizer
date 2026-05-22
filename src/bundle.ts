import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface BundleOptions {
  projectRoot: string;
  entryFile: string;
  metroConfig: string | null;
  platform: string;
  dev: boolean;
  statsOutputPath: string;
  resetCache?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string, kind: 'noise' | 'signal') => void;
}

const METRO_NOISE_PATTERNS: RegExp[] = [
  /^=+$/,
  /^From React Native \d/,
  /react-native-community\/template/,
  /This warning will be removed/,
  /metro\/issues/,
  /^● Validation Warning/,
  /^Unknown option /,
  /^This is probably a typing mistake/,
  /^Fixing it will remove this message/,
  /^or it will fail to build/,
  /^Please copy the template/,
];

export function isMetroNoise(line: string): boolean {
  return METRO_NOISE_PATTERNS.some((re) => re.test(line));
}

// ─── buildTempConfigContent ───────────────────────────────────────────────────

/**
 * Builds the content string for a temporary metro.config.js that wraps the
 * user's existing config (if any) with the captureSerializer.
 *
 * Exported for testing purposes.
 */
export function buildTempConfigContent(options: BundleOptions): string {
  const { metroConfig, statsOutputPath, platform } = options;

  const configRequireBlock =
    metroConfig !== null
      ? `
try {
  rawConfig = require(${JSON.stringify(metroConfig)});
  if (typeof rawConfig === 'function') {
    // async config — not supported yet, throw
    throw new Error(
      'metro-bundle-visualizer: async metro.config.js functions are not yet supported. ' +
      'Export a plain config object instead: module.exports = { ... }'
    );
  }
} catch (e) {
  if (e.message && e.message.includes('metro-bundle-visualizer')) throw e;
  // metro.config.js could not be loaded — use default empty config
}`
      : '';

  const serializerPath = path.join(__dirname, 'serializer.js');

  return `'use strict';
const { mergeConfig } = require('@react-native/metro-config');
const { captureSerializer } = require(${JSON.stringify(serializerPath)});

// userConfig: handle async format
let rawConfig = {};
${configRequireBlock}
const originalSerializer = rawConfig && rawConfig.serializer && rawConfig.serializer.customSerializer;

const captureWrapped = captureSerializer(originalSerializer, ${JSON.stringify(statsOutputPath)}, ${JSON.stringify(platform)});

module.exports = mergeConfig(rawConfig, {
  serializer: {
    customSerializer: captureWrapped,
  },
});
`;
}

// ─── writeTempConfig ──────────────────────────────────────────────────────────

/**
 * Writes the temporary metro.config.js to a temp file and returns its path.
 */
function writeTempConfig(options: BundleOptions): string {
  const content = buildTempConfigContent(options);
  const tmpFile = path.join(options.projectRoot, `mbv-metro-config-${Date.now()}.js`);
  fs.writeFileSync(tmpFile, content, 'utf8');
  return tmpFile;
}

// ─── spawnBundle ──────────────────────────────────────────────────────────────

function spawnBundle(
  projectRoot: string,
  opts: {
    entryFile: string;
    platform: string;
    dev: boolean;
    bundleOutput: string;
    config: string;
    resetCache: boolean;
    quiet: boolean;
    verbose: boolean;
    onStdoutLine?: (line: string) => void;
    onStderrLine?: (line: string, kind: 'noise' | 'signal') => void;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      'react-native',
      'bundle',
      '--entry-file',
      opts.entryFile,
      '--platform',
      opts.platform,
      '--dev',
      String(opts.dev),
      '--bundle-output',
      opts.bundleOutput,
      '--config',
      opts.config,
    ];

    if (opts.resetCache) {
      args.push('--reset-cache');
    }

    const child = spawn('npx', args, {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stderrLines: string[] = [];

    child.stdout.on('data', (chunk: Buffer) => {
      if (opts.quiet) return;
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        opts.onStdoutLine?.(trimmed);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        stderrLines.push(trimmed);
        if (stderrLines.length > 50) stderrLines.shift();
        const noise =
          !opts.verbose &&
          (trimmed.toLowerCase().startsWith('warn') || isMetroNoise(trimmed));
        // --quiet suppresses noise; signal-level stderr (real errors) always
        // surfaces because the flag is documented as "errors always shown".
        if (noise && opts.quiet) continue;
        opts.onStderrLine?.(trimmed, noise ? 'noise' : 'signal');
      }
    });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        const detail = stderrLines.length > 0 ? `\n${stderrLines.join('\n')}` : '';
        reject(new Error(`react-native bundle exited with code ${code ?? 'null'}${detail}`));
      }
    });

    child.on('error', reject);
  });
}

// ─── runBundle ────────────────────────────────────────────────────────────────

/**
 * Runs the Metro bundler with a temporary config that captures bundle stats.
 *
 * Steps:
 * 1. Write a temporary metro.config.js that wraps the user config.
 * 2. Spawn `npx react-native bundle` with the temp config.
 * 3. Clean up temp files when done (success or failure).
 */
export async function runBundle(options: BundleOptions): Promise<void> {
  const {
    projectRoot,
    entryFile,
    platform,
    dev,
    resetCache = false,
    quiet = false,
    verbose = false,
  } = options;

  const tempConfig = writeTempConfig(options);
  const bundleOutput = path.join(os.tmpdir(), `mbv-bundle-output-${Date.now()}.js`);

  try {
    await spawnBundle(projectRoot, {
      entryFile,
      platform,
      dev,
      bundleOutput,
      config: tempConfig,
      resetCache,
      quiet,
      verbose,
      onStdoutLine: options.onStdoutLine,
      onStderrLine: options.onStderrLine,
    });
  } finally {
    for (const file of [tempConfig, bundleOutput]) {
      try {
        fs.unlinkSync(file);
      } catch {
        // Best-effort cleanup — ignore errors
      }
    }
  }
}
