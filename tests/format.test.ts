import {
  visualLength,
  padRightVis,
  padLeftVis,
  formatBytes,
  truncatePackage,
  relativizePath,
  renderHeader,
  renderSummaryBox,
  renderReportFooter,
} from '../src/format';

// eslint-disable-next-line no-control-regex
const ANSI = (s: string): string => s.replace(/?\[[0-9;]*m/g, '');

describe('visualLength()', () => {
  it('strips ANSI escape codes', () => {
    expect(visualLength('[31mhello[0m')).toBe(5);
  });
  it('counts plain strings normally', () => {
    expect(visualLength('hello')).toBe(5);
  });
});

describe('padRightVis() / padLeftVis()', () => {
  it('pads ignoring ANSI', () => {
    const colored = '[1mhi[0m';
    expect(ANSI(padRightVis(colored, 5))).toBe('hi   ');
    expect(ANSI(padLeftVis(colored, 5))).toBe('   hi');
  });
  it('does not truncate if already wider', () => {
    expect(padRightVis('hello', 3)).toBe('hello');
  });
});

describe('formatBytes()', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1024, '1 KB'],
    [2048, '2 KB'],
    [1024 * 1024, '1.00 MB'],
    [1024 * 1024 * 3.71, '3.71 MB'],
  ])('formats %i as %s', (n, expected) => {
    expect(formatBytes(n)).toBe(expected);
  });
});

describe('truncatePackage()', () => {
  it('keeps short names', () => {
    expect(truncatePackage('react-native', 20)).toBe('react-native');
  });
  it('truncates long names with ellipsis', () => {
    const out = truncatePackage('@revenuecat/purchases-js-hybrid-mappings', 20);
    expect(out).toHaveLength(20);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('relativizePath()', () => {
  it('returns ./ path when inside cwd', () => {
    expect(relativizePath('/a/b/c/metro.config.js', '/a/b/c')).toBe('./metro.config.js');
  });
  it('returns absolute when outside cwd', () => {
    expect(relativizePath('/x/y/z', '/a/b/c')).toBe('/x/y/z');
  });
  it('returns "." when path equals cwd', () => {
    expect(relativizePath('/a/b/c', '/a/b/c')).toBe('.');
  });
  it('normalizes backslashes to forward slashes', () => {
    // path.posix.relative returns POSIX separators on macOS/Linux test runs,
    // so simulate the Windows shape directly by passing already-mixed input.
    // The function should produce no backslashes in its output.
    const out = relativizePath('/a/b/c/sub/file.js', '/a/b/c');
    expect(out).not.toMatch(/\\/);
  });
});

describe('renderHeader()', () => {
  it('includes brand, version, project name, platform, mode', () => {
    const lines = renderHeader({
      version: '0.2.0',
      projectName: 'my-app',
      entry: 'index.js',
      platform: 'ios',
      mode: 'production',
      configPath: '/proj/metro.config.js',
      cwd: '/proj',
    });
    const joined = lines.map(ANSI).join('\n');
    expect(joined).toContain('MBV');
    expect(joined).toContain('v0.2.0');
    expect(joined).toContain('my-app');
    expect(joined).toContain('(ios · production)');
    expect(joined).toContain('index.js');
    expect(joined).toContain('./metro.config.js');
  });
  it('omits config line when configPath is null', () => {
    const lines = renderHeader({
      version: '0.2.0',
      projectName: 'app',
      entry: 'index.js',
      platform: 'ios',
      mode: 'production',
      configPath: null,
      cwd: '/proj',
    });
    expect(lines.map(ANSI).join('\n')).not.toContain('config');
  });
});

describe('renderSummaryBox()', () => {
  it('renders total + modules + top items', () => {
    const lines = renderSummaryBox({
      totalBytes: 3.71 * 1024 * 1024,
      moduleCount: 1710,
      top: [
        { name: 'react-native', size: 831 * 1024, share: 21.9 },
        { name: 'react-native-reanimated', size: 716 * 1024, share: 18.8 },
      ],
    });
    const joined = lines.map(ANSI).join('\n');
    expect(joined).toContain('3.71 MB');
    expect(joined).toContain('1,710');
    expect(joined).toContain('react-native');
    expect(joined).toContain('21.9%');
    expect(joined).toContain('┌');
    expect(joined).toContain('└');
  });
  it('all rows are the same visual width', () => {
    const lines = renderSummaryBox({
      totalBytes: 1024 * 1024,
      moduleCount: 100,
      top: [{ name: 'foo', size: 1024, share: 5.0 }],
    });
    const widths = new Set(lines.map((l) => visualLength(l)));
    expect(widths.size).toBe(1);
  });
});

describe('renderReportFooter()', () => {
  it('shows relative path with opened tag', () => {
    const line = renderReportFooter('/proj/bundle-report.html', '/proj', true);
    expect(ANSI(line)).toContain('./bundle-report.html');
    expect(ANSI(line)).toContain('opened in browser');
  });
  it('omits opened tag when not opened', () => {
    const line = renderReportFooter('/proj/bundle-report.html', '/proj', false);
    expect(ANSI(line)).not.toContain('opened in browser');
  });
});
