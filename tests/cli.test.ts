import * as path from 'path';
import type { BundleStats } from '../src/serializer';
import { resolveProjectRoot, resolveJsonPath, buildJsonOutput, buildStepSummary, parseBudget } from '../src/cli';

describe('resolveProjectRoot', () => {
  it('returns process.cwd() when flag is undefined', () => {
    expect(resolveProjectRoot(undefined)).toBe(process.cwd());
  });

  it('returns an absolute path when flag is a relative path', () => {
    const result = resolveProjectRoot('../some/dir');
    expect(path.isAbsolute(result)).toBe(true);
  });

  it('returns the path unchanged when flag is already absolute', () => {
    const abs = '/absolute/path/to/project';
    expect(resolveProjectRoot(abs)).toBe(abs);
  });
});

describe('resolveJsonPath', () => {
  it('returns undefined when flag is undefined', () => {
    expect(resolveJsonPath(undefined)).toBeUndefined();
  });

  it('returns resolved default path when flag is true', () => {
    expect(resolveJsonPath(true)).toBe(path.resolve('./bundle-stats.json'));
  });

  it('returns resolved custom path when flag is a string', () => {
    expect(resolveJsonPath('reports/stats.json')).toBe(
      path.resolve('reports/stats.json'),
    );
  });
});

const baseStats: BundleStats = {
  generatedAt: '2026-05-10T00:00:00.000Z',
  platform: 'ios',
  totalBytes: 1000,
  modules: [
    { path: '/home/user/app/node_modules/react/index.js', size: 700, package: 'react' },
    { path: '/home/user/app/src/App.tsx', size: 300, package: '<app>' },
  ],
};

describe('buildJsonOutput', () => {
  it('makes module paths relative to projectRoot', () => {
    const output = JSON.parse(buildJsonOutput(baseStats, '/home/user/app'));
    expect(output.modules[0].path).toBe('node_modules/react/index.js');
    expect(output.modules[1].path).toBe('src/App.tsx');
  });

  it('adds schemaVersion 1', () => {
    const output = JSON.parse(buildJsonOutput(baseStats, '/home/user/app'));
    expect(output.schemaVersion).toBe(1);
  });

  it('leaves paths unchanged when they do not start with projectRoot', () => {
    const stats: BundleStats = {
      ...baseStats,
      modules: [{ path: '/other/path/file.js', size: 50, package: '<app>' }],
    };
    const output = JSON.parse(buildJsonOutput(stats, '/home/user/app'));
    expect(output.modules[0].path).toBe('/other/path/file.js');
  });

  it('does not mutate the original stats object', () => {
    const original = baseStats.modules[0].path;
    buildJsonOutput(baseStats, '/home/user/app');
    expect(baseStats.modules[0].path).toBe(original);
  });
});

const summaryStats: BundleStats = {
  generatedAt: '2026-05-10T14:32:00.000Z',
  platform: 'ios',
  projectName: 'MyApp',
  totalBytes: 10 * 1024 * 1024,
  modules: [
    { path: '/app/node_modules/react-native/index.js', size: 5 * 1024 * 1024, package: 'react-native' },
    { path: '/app/node_modules/react/index.js', size: 2 * 1024 * 1024, package: 'react' },
    { path: '/app/src/App.tsx', size: 3 * 1024 * 1024, package: '<app>' },
  ],
};

describe('buildStepSummary', () => {
  it('includes project name, platform, mode, and timestamp in the header', () => {
    const result = buildStepSummary(summaryStats, 'ios', 'production');
    expect(result).toContain('## Bundle Report — MyApp · ios · production');
    expect(result).toContain('2026-05-10T14:32:00.000Z');
  });

  it('lists packages sorted by size descending', () => {
    const result = buildStepSummary(summaryStats, 'ios', 'production');
    const rnIdx = result.indexOf('react-native');
    const appIdx = result.indexOf('<app>');
    expect(rnIdx).toBeLessThan(appIdx);
  });

  it('includes a Total row with correct total size', () => {
    const result = buildStepSummary(summaryStats, 'ios', 'production');
    expect(result).toContain('**Total**');
    expect(result).toContain('10.0 MB');
  });

  it('truncates package names longer than 40 characters', () => {
    const longStats: BundleStats = {
      ...summaryStats,
      modules: [{ path: '/x', size: 100, package: 'a'.repeat(50) }],
    };
    const result = buildStepSummary(longStats, 'ios', 'production');
    expect(result).toContain('...');
    const pkgLine = result.split('\n').find(l => l.includes('...'));
    expect(pkgLine).toBeDefined();
    const name = pkgLine!.split('|')[1].trim();
    expect(name.length).toBeLessThanOrEqual(40);
  });

  it('uses "app" as project name when projectName is undefined', () => {
    const noName: BundleStats = { ...summaryStats, projectName: undefined };
    const result = buildStepSummary(noName, 'ios', 'production');
    expect(result).toContain('## Bundle Report — app ·');
  });

  it('reflects the mode string in the header', () => {
    const result = buildStepSummary(summaryStats, 'android', 'development');
    expect(result).toContain('android · development');
  });

  it('sorts all three packages correctly (5MB > 3MB > 2MB)', () => {
    const result = buildStepSummary(summaryStats, 'ios', 'production');
    const rnIdx = result.indexOf('react-native');
    const appIdx = result.indexOf('<app>');
    const reactIdx = result.indexOf('| react |');
    expect(rnIdx).toBeLessThan(appIdx);
    expect(appIdx).toBeLessThan(reactIdx);
  });
});

describe('parseBudget', () => {
  it('parses raw byte numbers', () => {
    expect(parseBudget('1048576')).toBe(1048576);
  });

  it('parses kb suffix', () => {
    expect(parseBudget('500kb')).toBe(500 * 1024);
  });

  it('parses mb suffix', () => {
    expect(parseBudget('1mb')).toBe(1024 * 1024);
  });

  it('parses gb suffix', () => {
    expect(parseBudget('2gb')).toBe(2 * 1024 * 1024 * 1024);
  });

  it('is case-insensitive and tolerates whitespace', () => {
    expect(parseBudget(' 1.5 MB ')).toBe(Math.round(1.5 * 1024 * 1024));
  });

  it('throws on invalid input', () => {
    expect(() => parseBudget('abc')).toThrow();
    expect(() => parseBudget('1tb')).toThrow();
    expect(() => parseBudget('')).toThrow();
  });
});
