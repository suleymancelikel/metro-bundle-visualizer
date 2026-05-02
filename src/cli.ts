#!/usr/bin/env node
'use strict';

import { Command } from 'commander';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { detect } from './detect';
import { runBundle } from './bundle';
import { generateReport } from './report';

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
) as { version: string; name: string };

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
  .parse(process.argv);

const opts = program.opts<{
  platform: string;
  dev: boolean;
  entry?: string;
  out: string;
  open: boolean;
  resetCache: boolean;
}>();

async function main(): Promise<void> {
  const cwd = process.cwd();
  console.log(`\nmetro-bundle-visualizer v${pkg.version}\n`);

  // Proje tespiti
  let detected;
  try {
    detected = detect(cwd);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    console.error('Run this command from the root of a React Native project.');
    process.exit(1);
  }

  const entryFile = opts.entry ?? detected.entryFile;
  const statsPath = path.join(os.tmpdir(), `mbv-stats-${Date.now()}.json`);
  const outputPath = path.resolve(opts.out);

  console.log(`Project:  ${detected.projectRoot}`);
  console.log(`Entry:    ${entryFile}`);
  console.log(`Platform: ${opts.platform}`);
  console.log(`Mode:     ${opts.dev ? 'development' : 'production'}`);
  if (detected.metroConfig) {
    console.log(`Config:   ${detected.metroConfig}`);
  }
  console.log('\nBundling…\n');

  try {
    await runBundle({
      projectRoot: detected.projectRoot,
      entryFile,
      metroConfig: detected.metroConfig,
      platform: opts.platform,
      dev: opts.dev,
      statsOutputPath: statsPath,
      resetCache: opts.resetCache,
    });
  } catch (err) {
    console.error(`\nBundling failed: ${(err as Error).message}`);
    process.exit(2);
  }

  if (!fs.existsSync(statsPath)) {
    console.error('\nError: stats.json was not written by the Metro serializer.');
    console.error('Check that your metro.config.js does not override the serializer completely.');
    console.error('If using Expo, try: --entry node_modules/expo/AppEntry.js');
    process.exit(2);
  }

  const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
  stats.projectName = path.basename(detected.projectRoot);
  const totalMB = (stats.totalBytes / 1024 / 1024).toFixed(2);
  console.log(`\nBundle complete — ${totalMB} MB (${stats.modules.length} modules)`);

  generateReport(stats, outputPath);
  console.log(`\nReport saved to: ${outputPath}`);

  if (opts.open) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const open = require('open') as (target: string, options?: object) => Promise<void>;
      await open(outputPath);
      console.log('Opened in browser.');
    } catch {
      // browser açma başarısız olsa bile hata verme
    }
  }

  try {
    fs.unlinkSync(statsPath);
  } catch {
    // cleanup hatası kritik değil
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
