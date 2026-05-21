#!/usr/bin/env node
'use strict';

import { Command, InvalidArgumentError } from 'commander';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { detect } from './detect';
import { runBundle } from './bundle';
import { generateReport, extractStatsFromReport } from './report';
import { createReporter } from './reporter';
import { renderHeader, renderSummaryBox, renderReportFooter } from './format';
import type { BundleStats } from './serializer';

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
) as { version: string; name: string };

export function parseBudget(raw: string): number {
  const m = raw.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!m) {
    throw new InvalidArgumentError(
      `Invalid --budget value "${raw}". Use a number with optional suffix: b, kb, mb, gb (e.g. 1mb, 500kb, 1048576).`
    );
  }
  const num = parseFloat(m[1]);
  const unit = m[2] ?? 'b';
  const mult: Record<string, number> = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
  return Math.round(num * mult[unit]);
}

const program = new Command();

program
  .name('metro-bundle-visualizer')
  .version(pkg.version)
  .description('Interactive bundle size visualizer for React Native (RN 0.73+, New Architecture)')
  .option('-p, --platform <ios|android>', 'Platform to bundle for', 'ios')
  .option('--dev', 'Bundle in development mode (default: production)', false)
  .option('--entry <path>', 'Entry file path (default: auto-detected from package.json "main")')
  .option('-o, --out <path>', 'Output HTML report path', './bundle-report.html')
  .option('--no-open', 'Do not open the report in browser after generation')
  .option('--reset-cache', 'Reset Metro bundler cache before bundling', false)
  .option('--project-root <path>', 'Root directory of the React Native project (default: cwd)')
  .option('--json [path]', 'Write bundle stats JSON (default: ./bundle-stats.json)')
  .option('--quiet', 'Suppress progress output (errors always shown)', false)
  .option('--verbose', 'Show full Metro output including deprecation/validation warnings', false)
  .option('--budget <size>', 'Warn if total bundle size exceeds this size (e.g. 1mb, 500kb, 1048576)', parseBudget)
  .option('--compare <path>', 'Path to a previous bundle-report.html to show size deltas')
  .parse(process.argv);

const opts = program.opts<{
  platform: string;
  dev: boolean;
  entry?: string;
  out: string;
  open: boolean;
  resetCache: boolean;
  projectRoot?: string;
  json?: string | boolean;
  quiet: boolean;
  verbose: boolean;
  budget?: number;
  compare?: string;
}>();

export function resolveProjectRoot(flag: string | undefined): string {
  return flag ? path.resolve(flag) : process.cwd();
}

export function resolveJsonPath(
  flag: string | boolean | undefined,
): string | undefined {
  if (flag === undefined) return undefined;
  if (flag === true) return path.resolve('./bundle-stats.json');
  return path.resolve(flag as string);
}

export function buildJsonOutput(stats: BundleStats, projectRoot: string): string {
  const normalizedRoot = projectRoot.replace(/\\/g, '/');
  const prefix = normalizedRoot.endsWith('/') ? normalizedRoot : normalizedRoot + '/';
  const relativeStats = {
    schemaVersion: 1,
    ...stats,
    modules: stats.modules.map(m => {
      const normalizedPath = m.path.replace(/\\/g, '/');
      return {
        ...m,
        path: normalizedPath.startsWith(prefix)
          ? normalizedPath.slice(prefix.length)
          : normalizedPath,
      };
    }),
  };
  return JSON.stringify(relativeStats, null, 2);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

function pct(part: number, total: number): string {
  return total > 0 ? ((part / total) * 100).toFixed(1) + '%' : '0%';
}

export function topPackages(stats: BundleStats, n: number): Array<[string, number]> {
  const pkgTotals = new Map<string, number>();
  for (const m of stats.modules) {
    pkgTotals.set(m.package, (pkgTotals.get(m.package) ?? 0) + m.size);
  }
  return [...pkgTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export function buildStepSummary(
  stats: BundleStats,
  platform: string,
  mode: string,
): string {
  const top10 = topPackages(stats, 10);

  const projectName = stats.projectName ?? 'app';

  const rows = top10.map(([name, size]) => {
    const display = name.length > 40 ? name.slice(0, 37) + '...' : name;
    return `| ${display} | ${formatBytes(size)} | ${pct(size, stats.totalBytes)} |`;
  });

  return [
    `## Bundle Report — ${projectName} · ${platform} · ${mode} · ${stats.generatedAt}`,
    '| Package | Size | Share |',
    '|---|---|---|',
    ...rows,
    `| **Total** | **${formatBytes(stats.totalBytes)}** | |`,
  ].join('\n');
}

async function main(): Promise<void> {
  const cwd = resolveProjectRoot(opts.projectRoot);
  const reporter = createReporter({ quiet: opts.quiet, verbose: opts.verbose });

  let detected;
  try {
    detected = detect(cwd);
  } catch (err) {
    reporter.stop();
    console.error(`Error: ${(err as Error).message}`);
    console.error('Run this command from the root of a React Native project.');
    process.exit(1);
  }

  const entryFile = opts.entry ?? detected.entryFile;
  const statsPath = path.join(os.tmpdir(), `mbv-stats-${Date.now()}.json`);
  const outputPath = path.resolve(opts.out);

  if (!opts.quiet) {
    const headerLines = renderHeader({
      version: pkg.version,
      projectName: path.basename(detected.projectRoot),
      entry: entryFile,
      platform: opts.platform,
      mode: opts.dev ? 'development' : 'production',
      configPath: detected.metroConfig,
      cwd: detected.projectRoot,
    });
    reporter.log('');
    for (const line of headerLines) reporter.log(line);
    reporter.log('');
  }

  reporter.startPhase('Bundling with Metro');
  const hintTimer = !opts.quiet
    ? setTimeout(() => {
        reporter.note('  (first run / cold cache can take 30-60s — Metro is building the dependency graph)');
      }, 5000)
    : null;

  try {
    await runBundle({
      projectRoot: detected.projectRoot,
      entryFile,
      metroConfig: detected.metroConfig,
      platform: opts.platform,
      dev: opts.dev,
      statsOutputPath: statsPath,
      resetCache: opts.resetCache,
      quiet: opts.quiet,
      verbose: opts.verbose,
      onStdoutLine: (line) => reporter.setDetail(line),
      onStderrLine: (line, kind) => {
        if (kind === 'signal') reporter.warn(line);
      },
    });
  } catch (err) {
    if (hintTimer) clearTimeout(hintTimer);
    reporter.failPhase('Bundling failed');
    reporter.stop();
    console.error(`\nBundling failed: ${(err as Error).message}`);
    process.exit(2);
  } finally {
    if (hintTimer) clearTimeout(hintTimer);
  }

  if (!fs.existsSync(statsPath)) {
    reporter.failPhase('Bundling failed (serializer did not write stats)');
    reporter.stop();
    console.error('\nError: stats.json was not written by the Metro serializer.');
    console.error('Check that your metro.config.js does not override the serializer completely.');
    console.error('If using Expo, try: --entry node_modules/expo/AppEntry.js');
    process.exit(2);
  }

  reporter.succeedPhase('Bundled');

  const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8')) as BundleStats;
  stats.projectName = path.basename(detected.projectRoot);
  if (!opts.quiet) {
    const top3 = topPackages(stats, 3).map(([name, size]) => ({
      name,
      size,
      share: stats.totalBytes > 0 ? (size / stats.totalBytes) * 100 : 0,
    }));
    const boxLines = renderSummaryBox({
      totalBytes: stats.totalBytes,
      moduleCount: stats.modules.length,
      top: top3,
    });
    reporter.log('');
    for (const line of boxLines) reporter.log(line);
  }

  let previousStats: BundleStats | undefined;
  if (opts.compare) {
    try {
      const compareHtml = fs.readFileSync(opts.compare, 'utf8');
      const extracted = extractStatsFromReport(compareHtml);
      if (extracted) {
        previousStats = extracted;
      } else {
        process.stderr.write('[metro-bundle-visualizer] Warning: could not extract stats from --compare file\n');
      }
    } catch {
      process.stderr.write(`[metro-bundle-visualizer] Warning: --compare file not readable: ${opts.compare}\n`);
    }
  }

  generateReport(stats, outputPath, { budget: opts.budget, previousStats });

  const jsonOutputPath = resolveJsonPath(opts.json);
  if (jsonOutputPath) {
    fs.mkdirSync(path.dirname(jsonOutputPath), { recursive: true });
    fs.writeFileSync(jsonOutputPath, buildJsonOutput(stats, detected.projectRoot), 'utf8');
    // Always print JSON path even in quiet mode — user must know where output landed
    process.stdout.write(`JSON saved to: ${jsonOutputPath}\n`);
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const mode = opts.dev ? 'development' : 'production';
    const summary = buildStepSummary(stats, opts.platform, mode);
    fs.appendFileSync(summaryPath, summary + '\n\n', 'utf8');
  }

  let opened = false;
  if (opts.open) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const open = require('open') as (target: string, options?: object) => Promise<void>;
      await open(outputPath);
      opened = true;
    } catch {
      // browser open failure is non-fatal
    }
  }

  if (!opts.quiet) {
    reporter.log('');
    // Relativize against the actual shell cwd, not detected.projectRoot — the
    // printed path must be usable from the user's terminal session.
    reporter.log(renderReportFooter(outputPath, process.cwd(), opened));
  }

  reporter.stop();

  try {
    fs.unlinkSync(statsPath);
  } catch {
    // cleanup failure is non-critical
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
