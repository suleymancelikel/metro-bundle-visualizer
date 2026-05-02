import fs from 'fs';
import path from 'path';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ModuleStats {
  path: string;
  size: number;
  package: string;
}

export interface BundleStats {
  generatedAt: string; // ISO string
  platform: string;
  totalBytes: number;
  modules: ModuleStats[];
}

// ─── Internal Metro type ──────────────────────────────────────────────────────

type MetroSerializer = (
  entryPoint: string,
  prepend: unknown[],
  graph: {
    dependencies: Map<
      string,
      {
        output?: Array<{ type: string; data: { code: string } }>;
      }
    >;
  },
  options: { platform?: string },
) => Promise<string>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isJsOutput(o: { type: string }): boolean {
  return o.type === 'js/module' || o.type === 'js/script';
}

/**
 * Extract the npm package name from a module path.
 *
 * Handles:
 *  - Unscoped packages:  `…/node_modules/lodash/…`          → `'lodash'`
 *  - Scoped packages:    `…/node_modules/@scope/pkg/…`       → `'@scope/pkg'`
 *  - Windows paths:      backslashes are normalised first
 *  - App code (no node_modules in path)                      → `'<app>'`
 */
export function extractPackageName(modulePath: string): string {
  const normalized = modulePath.replace(/\\/g, '/');
  const match = normalized.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/);
  return match ? match[1] : '<app>';
}

// ─── captureSerializer ────────────────────────────────────────────────────────

/**
 * Wraps (or replaces) a Metro serializer so that after every bundle, a
 * `BundleStats` JSON file is written to `statsOutputPath`.
 *
 * @param originalSerializer  The existing Metro serializer, if any.
 * @param statsOutputPath     Absolute path for the output JSON file.
 * @param platform            The target platform string (e.g. `'ios'`).
 */
export function captureSerializer(
  originalSerializer: MetroSerializer | undefined,
  statsOutputPath: string,
  platform: string,
): MetroSerializer {
  return async (entryPoint, prepend, graph, options) => {
    // ── 1. Collect per-module stats ──────────────────────────────────────────
    const modules: ModuleStats[] = [];
    let totalBytes = 0;

    for (const [modulePath, mod] of graph.dependencies) {
      const jsOutput = mod.output?.find(isJsOutput);
      const code = jsOutput?.data?.code ?? '';
      const size = Buffer.byteLength(code, 'utf8');

      totalBytes += size;

      modules.push({
        path: modulePath,
        size,
        package: extractPackageName(modulePath),
      });
    }

    // ── 2. Write stats JSON ──────────────────────────────────────────────────
    const stats: BundleStats = {
      generatedAt: new Date().toISOString(),
      platform: options.platform ?? platform,
      totalBytes,
      modules,
    };

    const outputDir = path.dirname(statsOutputPath);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(statsOutputPath, JSON.stringify(stats), 'utf8');

    // ── 3. Delegate to the original serializer (or use fallback) ─────────────
    if (originalSerializer) {
      return originalSerializer(entryPoint, prepend, graph, options);
    }

    // Fallback: concatenate all JS module codes
    const allCode = [...graph.dependencies.values()]
      .map(m => m.output?.find(isJsOutput)?.data?.code ?? '')
      .join('\n');

    return allCode;
  };
}
