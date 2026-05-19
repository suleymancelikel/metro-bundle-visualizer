import * as fs from 'fs';
import * as path from 'path';
import type { BundleStats } from './serializer';

const UI_DIR = path.join(__dirname, 'ui');

export interface ReportOptions {
  budget?: number;
  previousStats?: BundleStats;
}

export function generateReport(stats: BundleStats, outputPath: string, options: ReportOptions = {}): void {
  const template = fs.readFileSync(path.join(UI_DIR, 'template.html'), 'utf8');

  // JSON injection safety: escape </script> sequences
  const safeJson = JSON.stringify(stats)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  const styles = readAsset('styles.css');
  const d3 = readAsset('d3.min.js');
  const treemap = readAsset('treemap.js');

  let preTreemapScripts = '';
  if (options.budget !== undefined) {
    preTreemapScripts += `<script>window.__BUNDLE_BUDGET__ = ${options.budget};</script>\n  `;
  }
  if (options.previousStats) {
    const prevJson = JSON.stringify(options.previousStats)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');
    preTreemapScripts += `<script>window.__PREV_STATS__ = ${prevJson};</script>\n  `;
  }

  const finalHtml = template
    .replace('/* STATS_PLACEHOLDER */', () => safeJson)
    .replace('/* STYLES_PLACEHOLDER */', () => styles)
    .replace('/* D3_PLACEHOLDER */', () => d3)
    .replace(
      '<script>/* TREEMAP_PLACEHOLDER */</script>',
      () => preTreemapScripts + '<script>' + treemap + '</script>'
    )
    .replace('/* TITLE_PLACEHOLDER */', `Bundle Report — ${stats.projectName ?? 'app'} (${stats.platform})`);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, finalHtml, 'utf8');
}

export function extractStatsFromReport(html: string): BundleStats | null {
  const match = html.match(/window\.__BUNDLE_STATS__\s*=\s*(\{[\s\S]*?\});/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as BundleStats;
  } catch {
    return null;
  }
}

function readAsset(filename: string): string {
  try {
    return fs.readFileSync(path.join(UI_DIR, filename), 'utf8');
  } catch {
    process.stderr.write(`metro-bundle-visualizer: warning: missing UI asset: ${filename}\n`);
    return '';
  }
}
