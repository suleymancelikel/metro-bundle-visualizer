'use strict';

import pc from 'picocolors';
import path from 'path';

// Strip ANSI SGR escape sequences. Build a fresh regex per call to avoid
// lastIndex pollution when the function is invoked many times in a row.
/* eslint-disable no-control-regex */
export function visualLength(s: string): number {
  return s.replace(/\[[0-9;]*m/g, '').length;
}

export function padRightVis(s: string, width: number): string {
  const pad = Math.max(0, width - visualLength(s));
  return s + ' '.repeat(pad);
}

export function padLeftVis(s: string, width: number): string {
  const pad = Math.max(0, width - visualLength(s));
  return ' '.repeat(pad) + s;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

export function truncatePackage(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, Math.max(1, maxLen - 1)) + '…';
}

export function relativizePath(p: string, cwd: string): string {
  try {
    const rel = path.relative(cwd, p);
    if (rel.startsWith('..')) return p;
    const normalized = rel.replace(/\\/g, '/');
    if (normalized === '') return '.';
    return './' + normalized;
  } catch {
    return p;
  }
}

export interface HeaderFields {
  version: string;
  projectName: string;
  entry: string;
  platform: string;
  mode: string;
  configPath: string | null;
  cwd: string;
}

export function renderHeader(f: HeaderFields): string[] {
  const brand = pc.bgMagenta(pc.black(' MBV '));
  const ver = pc.dim(`v${f.version}`);
  const meta = pc.dim(`(${f.platform} · ${f.mode})`);
  const lines: string[] = [];
  lines.push(`${brand} ${ver}`);
  lines.push('');
  lines.push(`  ${pc.dim('›')}  ${pc.dim('project')}   ${pc.bold(f.projectName)}  ${meta}`);
  lines.push(`  ${pc.dim('›')}  ${pc.dim('entry')}     ${f.entry}`);
  if (f.configPath) {
    lines.push(`  ${pc.dim('›')}  ${pc.dim('config')}    ${relativizePath(f.configPath, f.cwd)}`);
  }
  return lines;
}

export interface SummaryTopItem {
  name: string;
  size: number;
  share: number;
}

export interface SummaryFields {
  totalBytes: number;
  moduleCount: number;
  top: SummaryTopItem[];
}

// Width budget for the box content area between │ and │ (inclusive of the
// 1-space inner padding on each side). Sized so the widest row — the top-3
// items: `▸ <name 28>  <size 9>  <share 6>` = 49 chars — fits exactly.
const INNER = 51;
const NAME_WIDTH = 28;

export function renderSummaryBox(f: SummaryFields): string[] {
  const titleLabel = '─ bundle ';
  const top = `┌${titleLabel}${'─'.repeat(INNER - titleLabel.length)}┐`;
  const bottom = `└${'─'.repeat(INNER)}┘`;
  const row = (content: string): string =>
    `${pc.dim('│')} ${padRightVis(content, INNER - 2)} ${pc.dim('│')}`;

  const lines: string[] = [];
  lines.push('  ' + pc.dim(top));

  const totalSummary = `${pc.bold(formatBytes(f.totalBytes))} ${pc.dim('total')}  ·  ${pc.bold(f.moduleCount.toLocaleString())} ${pc.dim('modules')}`;
  lines.push('  ' + row(totalSummary));

  if (f.top.length > 0) {
    lines.push('  ' + row(''));
    for (const item of f.top) {
      const bullet = pc.dim('▸');
      const name = truncatePackage(item.name, NAME_WIDTH);
      const size = padLeftVis(pc.bold(formatBytes(item.size)), 9);
      const share = padLeftVis(pc.dim(`${item.share.toFixed(1)}%`), 6);
      const content = `${bullet} ${padRightVis(name, NAME_WIDTH)}  ${size}  ${share}`;
      lines.push('  ' + row(content));
    }
  }

  lines.push('  ' + pc.dim(bottom));
  return lines;
}

export function renderReportFooter(reportPath: string, cwd: string, opened: boolean): string {
  const rel = relativizePath(reportPath, cwd);
  const tag = opened ? '  ' + pc.dim('(opened in browser)') : '';
  return `  ${pc.cyan('→')}  ${rel}${tag}`;
}
