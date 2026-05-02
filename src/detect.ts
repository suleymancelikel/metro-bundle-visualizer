import fs from 'fs';
import path from 'path';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DetectResult {
  projectRoot: string;
  entryFile: string;
  metroConfig: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Walk upward from `startDir` until a directory containing `package.json` is
 * found.  Returns the directory path or `null` if the filesystem root is
 * reached without finding one.
 */
function findPackageRoot(startDir: string): string | null {
  // Normalise once so we always work with the OS-native separator.
  let current = path.normalize(startDir);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = path.join(current, 'package.json');

    if (fs.existsSync(candidate)) {
      return current;
    }

    const parent = path.dirname(current);

    // We've hit the filesystem root — stop.
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

/**
 * Read the `main` field from the package.json located at `pkgJsonPath`.
 * Returns the field value, or `null` if the field is absent / not a string.
 */
function readMainField(pkgJsonPath: string): string | null {
  try {
    const raw = fs.readFileSync(pkgJsonPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);

    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'main' in parsed &&
      typeof (parsed as Record<string, unknown>).main === 'string'
    ) {
      return (parsed as Record<string, string>).main;
    }
  } catch {
    // Malformed JSON — fall through to null.
  }

  return null;
}

/**
 * Returns the `main` field from package.json, or `"index.js"` if absent.
 */
function resolveEntryFile(pkgJsonPath: string): string {
  const main = readMainField(pkgJsonPath);
  return main ?? 'index.js';
}

/**
 * Detect whether a metro config file exists in `projectRoot`.
 *
 * Search order: `metro.config.js` → `metro.config.ts`.
 * Returns the full, normalised path to the first file found, or `null`.
 */
function findMetroConfig(projectRoot: string): string | null {
  const candidates = ['metro.config.js', 'metro.config.ts'];

  for (const filename of candidates) {
    // Use path.join (which normalises separators) instead of string
    // concatenation so Windows paths are handled correctly.
    const fullPath = path.join(projectRoot, filename);

    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

/**
 * Warn when the discovered project root appears to live inside a
 * `node_modules/` subtree (monorepo / workspace package scenario).
 * We emit a warning but do NOT block execution.
 */
function warnIfInsideNodeModules(projectRoot: string): void {
  // Normalise separators before splitting.
  const parts = path.normalize(projectRoot).split(path.sep);

  if (parts.includes('node_modules')) {
    process.stderr.write(
      `[metro-bundle-visualizer] Warning: detected project root inside node_modules — ` +
        `"${projectRoot}". Detection may be inaccurate in monorepo setups.\n`,
    );
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Detect the project root, entry file and metro config from `cwd`.
 *
 * @throws {Error} If no `package.json` can be found in `cwd` or any of its
 *   ancestor directories.
 */
export function detect(cwd: string): DetectResult {
  const projectRoot = findPackageRoot(cwd);

  if (projectRoot === null) {
    throw new Error(`No package.json found in ${cwd}`);
  }

  warnIfInsideNodeModules(projectRoot);

  const pkgJsonPath = path.join(projectRoot, 'package.json');
  const entryFile = resolveEntryFile(pkgJsonPath);
  const metroConfig = findMetroConfig(projectRoot);

  return {
    projectRoot,
    entryFile,
    metroConfig,
  };
}
