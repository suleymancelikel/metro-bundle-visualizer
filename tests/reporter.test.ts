import { createReporter, __test__ } from '../src/reporter';

describe('createReporter()', () => {
  it('returns PlainReporter when isTTY is false', () => {
    const r = createReporter({ isTTY: false, isCI: false });
    expect(r.isInteractive).toBe(false);
  });

  it('returns PlainReporter when CI is set', () => {
    const r = createReporter({ isTTY: true, isCI: true });
    expect(r.isInteractive).toBe(false);
  });

  it('returns PlainReporter when quiet', () => {
    const r = createReporter({ isTTY: true, isCI: false, quiet: true });
    expect(r.isInteractive).toBe(false);
  });

  it('returns TTYReporter when TTY + not CI + not quiet', () => {
    const r = createReporter({ isTTY: true, isCI: false, quiet: false });
    expect(r.isInteractive).toBe(true);
    r.stop();
  });
});

describe('truncateDetail()', () => {
  it('keeps short lines untouched', () => {
    expect(__test__.truncateDetail('short', 80)).toBe('short');
  });
  it('truncates long lines with ellipsis', () => {
    const long = 'x'.repeat(120);
    const out = __test__.truncateDetail(long, 80);
    expect(out).toHaveLength(80);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('PlainReporter', () => {
  let stdout = '';
  let stderr = '';
  let writeStdout: typeof process.stdout.write;
  let writeStderr: typeof process.stderr.write;

  beforeEach(() => {
    stdout = '';
    stderr = '';
    writeStdout = process.stdout.write.bind(process.stdout);
    writeStderr = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((chunk: string) => {
      stdout += chunk;
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string) => {
      stderr += chunk;
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stdout.write = writeStdout;
    process.stderr.write = writeStderr;
  });

  it('writes log lines to stdout', () => {
    const r = new __test__.PlainReporter({ isTTY: false });
    r.log('hello');
    expect(stdout).toContain('hello');
  });

  it('emits phase start + success markers', () => {
    let t = 1000;
    const r = new __test__.PlainReporter({ isTTY: false, now: () => t });
    r.startPhase('Bundling');
    t = 3500;
    r.succeedPhase('Bundled');
    expect(stdout).toContain('→ Bundling');
    expect(stdout).toContain('✓ Bundled');
    expect(stdout).toContain('2.5s');
  });

  it('suppresses log/note/setDetail in quiet mode', () => {
    const r = new __test__.PlainReporter({ isTTY: false, quiet: true });
    r.log('a');
    r.note('b');
    r.setDetail('c');
    expect(stdout).toBe('');
  });

  it('ignores setDetail unless verbose', () => {
    const plain = new __test__.PlainReporter({ isTTY: false });
    plain.setDetail('x');
    expect(stdout).toBe('');

    stdout = '';
    const verbose = new __test__.PlainReporter({ isTTY: false, verbose: true });
    verbose.setDetail('y');
    expect(stdout).toContain('y');
  });

  it('writes warnings to stderr', () => {
    const r = new __test__.PlainReporter({ isTTY: false });
    r.warn('uh oh');
    expect(stderr).toContain('uh oh');
  });

  it('failPhase always writes to stderr (even in quiet)', () => {
    const r = new __test__.PlainReporter({ isTTY: false, quiet: true });
    r.startPhase('X');
    r.failPhase('X failed');
    expect(stderr).toContain('✗ X failed');
  });
});

describe('TTYReporter', () => {
  let stdout = '';
  let writeStdout: typeof process.stdout.write;

  beforeEach(() => {
    stdout = '';
    writeStdout = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      stdout += chunk;
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = writeStdout;
  });

  it('startPhase + succeedPhase produce visible markers', () => {
    let t = 1000;
    const r = new __test__.TTYReporter({ isTTY: true, now: () => t });
    r.startPhase('Bundling');
    t = 1200;
    r.setDetail('module xyz');
    r.succeedPhase('Bundled');
    r.stop();
    expect(stdout).toContain('Bundling');
    expect(stdout).toContain('Bundled');
    expect(stdout).toContain('✓');
  });

  it('failPhase produces a red ✗ marker', () => {
    const r = new __test__.TTYReporter({ isTTY: true });
    r.startPhase('Bundling');
    r.failPhase('Bundling failed');
    r.stop();
    expect(stdout).toContain('✗');
    expect(stdout).toContain('Bundling failed');
  });

  it('log/note still write while spinner is not active', () => {
    const r = new __test__.TTYReporter({ isTTY: true });
    r.log('hello world');
    r.note('a hint');
    r.stop();
    expect(stdout).toContain('hello world');
    expect(stdout).toContain('a hint');
  });

  it('respects quiet for log/note/setDetail but allows failPhase', () => {
    let stderr = '';
    const writeStderr = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((c: string) => { stderr += c; return true; }) as typeof process.stderr.write;
    try {
      const r = new __test__.TTYReporter({ isTTY: true, quiet: true });
      r.log('nope');
      r.note('nope');
      r.startPhase('X');
      r.setDetail('nope');
      r.failPhase('boom');
      r.stop();
      expect(stdout).not.toContain('nope');
      expect(stdout).toContain('boom');
    } finally {
      process.stderr.write = writeStderr;
    }
  });
});
