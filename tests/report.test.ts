import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateReport } from '../src/report';
import type { BundleStats } from '../src/serializer';

const mockStats: BundleStats = {
  generatedAt: '2026-05-01T00:00:00.000Z',
  platform: 'ios',
  totalBytes: 1500,
  projectName: 'MyApp',
  modules: [
    { path: '/app/index.js', size: 800, package: '<app>' },
    { path: '/app/node_modules/react/index.js', size: 700, package: 'react' },
  ],
};

function withTmpDir(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mbv-test-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('generateReport', () => {
  it('creates the output file at outputPath', () => {
    withTmpDir(dir => {
      const outputPath = path.join(dir, 'report.html');
      generateReport(mockStats, outputPath);
      expect(fs.existsSync(outputPath)).toBe(true);
    });
  });

  it('includes window.__BUNDLE_STATS__ in the HTML', () => {
    withTmpDir(dir => {
      const outputPath = path.join(dir, 'report.html');
      generateReport(mockStats, outputPath);
      const html = fs.readFileSync(outputPath, 'utf8');
      expect(html).toContain('window.__BUNDLE_STATS__');
    });
  });

  it('injects platform and totalBytes into the HTML', () => {
    withTmpDir(dir => {
      const outputPath = path.join(dir, 'report.html');
      generateReport(mockStats, outputPath);
      const html = fs.readFileSync(outputPath, 'utf8');
      expect(html).toContain('"platform":"ios"');
      expect(html).toContain('"totalBytes":1500');
    });
  });

  it('sets the title to include projectName and platform', () => {
    withTmpDir(dir => {
      const outputPath = path.join(dir, 'report.html');
      generateReport(mockStats, outputPath);
      const html = fs.readFileSync(outputPath, 'utf8');
      expect(html).toContain('<title>Bundle Report — MyApp (ios)</title>');
    });
  });

  it('produces a self-contained HTML with no external URLs', () => {
    withTmpDir(dir => {
      const outputPath = path.join(dir, 'report.html');
      generateReport(mockStats, outputPath);
      const html = fs.readFileSync(outputPath, 'utf8');
      expect(html).not.toMatch(/https?:\/\//);
    });
  });

  it('writes a stderr warning when a UI asset is missing', () => {
    withTmpDir(dir => {
      const outputPath = path.join(dir, 'report.html');
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockReturnValue(true);

      // In the test environment __dirname resolves to src/, so d3.min.js is absent
      generateReport(mockStats, outputPath);

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing UI asset:'),
      );

      stderrSpy.mockRestore();
    });
  });

  it('injects CSS design tokens into generated report', () => {
    withTmpDir(dir => {
      const outputPath = path.join(dir, 'report.html');
      generateReport(mockStats, outputPath);
      const html = fs.readFileSync(outputPath, 'utf8');
      expect(html).toContain('--bg-0:');
      expect(html).toContain('--accent:');
      expect(html).toContain('--text-1:');
    });
  });

  it('escapes </script> sequences in injected JSON (XSS prevention)', () => {
    const maliciousStats: BundleStats = {
      ...mockStats,
      modules: [
        {
          path: '/app/node_modules/evil/</script><script>alert(1)</script>',
          size: 100,
          package: 'evil',
        },
      ],
    };

    withTmpDir(dir => {
      const outputPath = path.join(dir, 'report.html');
      generateReport(maliciousStats, outputPath);
      const html = fs.readFileSync(outputPath, 'utf8');
      // The raw </script> should not appear in the injected JSON
      expect(html).not.toContain('</script><script>alert(1)</script>');
      // The escaped form should be present instead
      expect(html).toContain('\\u003c/script\\u003e');
    });
  });
});
