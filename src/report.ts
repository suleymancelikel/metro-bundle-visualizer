import * as fs from 'fs';
import * as path from 'path';
import type { BundleStats } from './serializer';

const UI_DIR = path.join(__dirname, 'ui');

export function generateReport(stats: BundleStats, outputPath: string): void {
  const template = fs.readFileSync(path.join(UI_DIR, 'template.html'), 'utf8');

  // JSON injection safety: escape </script> sequences
  const safeJson = JSON.stringify(stats)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  const styles = readAsset('styles.css');
  const d3 = readAsset('d3.min.js');
  const treemap = readAsset('treemap.js');

  const html = template
    .replace('/* STATS_PLACEHOLDER */', () => safeJson)
    .replace('/* STYLES_PLACEHOLDER */', () => styles)
    .replace('/* D3_PLACEHOLDER */', () => d3)
    .replace('/* TREEMAP_PLACEHOLDER */', () => treemap);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, 'utf8');
}

function readAsset(filename: string): string {
  try {
    return fs.readFileSync(path.join(UI_DIR, filename), 'utf8');
  } catch {
    return '';
  }
}
