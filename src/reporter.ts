'use strict';

import pc from 'picocolors';
import logUpdate from 'log-update';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const FRAME_INTERVAL_MS = 80;

export interface Reporter {
  log(line: string): void;
  note(line: string): void;
  warn(line: string): void;
  startPhase(label: string): void;
  setDetail(line: string): void;
  succeedPhase(label: string): void;
  failPhase(label: string): void;
  stop(): void;
  readonly isInteractive: boolean;
}

export interface ReporterOptions {
  quiet?: boolean;
  verbose?: boolean;
  isTTY?: boolean;
  isCI?: boolean;
  now?: () => number;
}

function truncateDetail(line: string, maxLen = 80): string {
  if (line.length <= maxLen) return line;
  return line.slice(0, maxLen - 1) + '…';
}

class TTYReporter implements Reporter {
  readonly isInteractive = true;
  private label = '';
  private detail = '';
  private startTime = 0;
  private frameIdx = 0;
  private timer: NodeJS.Timeout | null = null;
  private readonly now: () => number;
  private readonly quiet: boolean;

  constructor(opts: ReporterOptions) {
    this.now = opts.now ?? Date.now;
    this.quiet = opts.quiet ?? false;
  }

  log(line: string): void {
    if (this.quiet) return;
    this.withCleared(() => process.stdout.write(line + '\n'));
  }

  note(line: string): void {
    if (this.quiet) return;
    this.withCleared(() => process.stdout.write(pc.dim(line) + '\n'));
  }

  warn(line: string): void {
    this.withCleared(() => process.stderr.write(pc.yellow(line) + '\n'));
  }

  startPhase(label: string): void {
    if (this.quiet) return;
    this.label = label;
    this.detail = '';
    this.startTime = this.now();
    this.frameIdx = 0;
    this.render();
    if (!this.timer) {
      this.timer = setInterval(() => {
        this.frameIdx = (this.frameIdx + 1) % FRAMES.length;
        this.render();
      }, FRAME_INTERVAL_MS);
      this.timer.unref?.();
    }
  }

  setDetail(line: string): void {
    if (this.quiet) return;
    this.detail = truncateDetail(line);
    this.render();
  }

  succeedPhase(label: string): void {
    if (this.quiet) return;
    this.stopTimer();
    logUpdate(`${pc.green('✓')} ${label} ${pc.dim(this.elapsed())}`);
    logUpdate.done();
    this.label = '';
    this.detail = '';
  }

  failPhase(label: string): void {
    this.stopTimer();
    logUpdate(`${pc.red('✗')} ${label} ${pc.dim(this.elapsed())}`);
    logUpdate.done();
    this.label = '';
    this.detail = '';
  }

  stop(): void {
    this.stopTimer();
    logUpdate.clear();
    logUpdate.done();
  }

  private render(): void {
    const frame = pc.cyan(FRAMES[this.frameIdx]);
    const elapsed = pc.dim(this.elapsed());
    const main = `${frame} ${this.label} ${elapsed}`;
    const sub = this.detail ? `\n  ${pc.dim(this.detail)}` : '';
    logUpdate(main + sub);
  }

  private elapsed(): string {
    const sec = (this.now() - this.startTime) / 1000;
    return sec >= 10 ? `${sec.toFixed(0)}s` : `${sec.toFixed(1)}s`;
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private withCleared(fn: () => void): void {
    if (this.timer) {
      logUpdate.clear();
      fn();
      this.render();
    } else {
      fn();
    }
  }
}

class PlainReporter implements Reporter {
  readonly isInteractive = false;
  private readonly quiet: boolean;
  private readonly verbose: boolean;
  private readonly now: () => number;
  private phaseStart = 0;
  private phaseLabel = '';

  constructor(opts: ReporterOptions) {
    this.quiet = opts.quiet ?? false;
    this.verbose = opts.verbose ?? false;
    this.now = opts.now ?? Date.now;
  }

  log(line: string): void {
    if (this.quiet) return;
    process.stdout.write(line + '\n');
  }

  note(line: string): void {
    if (this.quiet) return;
    process.stdout.write(line + '\n');
  }

  warn(line: string): void {
    process.stderr.write(line + '\n');
  }

  startPhase(label: string): void {
    this.phaseLabel = label;
    this.phaseStart = this.now();
    if (this.quiet) return;
    process.stdout.write(`→ ${label}\n`);
  }

  setDetail(line: string): void {
    if (!this.verbose || this.quiet) return;
    process.stdout.write(`  ${line}\n`);
  }

  succeedPhase(label: string): void {
    if (this.quiet) return;
    const ms = this.now() - this.phaseStart;
    process.stdout.write(`✓ ${label} (${(ms / 1000).toFixed(1)}s)\n`);
  }

  failPhase(label: string): void {
    const ms = this.now() - this.phaseStart;
    process.stderr.write(`✗ ${label} (${(ms / 1000).toFixed(1)}s)\n`);
  }

  stop(): void {
    // no-op
  }
}

export function createReporter(opts: ReporterOptions = {}): Reporter {
  const tty = opts.isTTY ?? Boolean(process.stdout.isTTY);
  // process.env.CI can be 'false' (some users export it explicitly in dotfiles
  // to opt out of CI-mode tooling); Boolean('false') is truthy so check value.
  const ci = opts.isCI ?? (!!process.env.CI && process.env.CI !== 'false' && process.env.CI !== '0');
  const useTTY = tty && !ci && !opts.quiet;
  return useTTY ? new TTYReporter(opts) : new PlainReporter(opts);
}

export const __test__ = { TTYReporter, PlainReporter, truncateDetail };
