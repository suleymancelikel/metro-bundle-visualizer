import { buildTempConfigContent, BundleOptions } from '../src/bundle';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOptions(overrides: Partial<BundleOptions> = {}): BundleOptions {
  return {
    projectRoot: '/project',
    entryFile: 'index.js',
    metroConfig: '/project/metro.config.js',
    platform: 'ios',
    dev: false,
    statsOutputPath: '/project/.metro-bundle-visualizer/stats.json',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildTempConfigContent()', () => {
  // ── Test 1: No metro config (null) ─────────────────────────────────────────
  describe('1. metroConfig: null', () => {
    it('starts with rawConfig = {} and skips the require block', () => {
      const content = buildTempConfigContent(makeOptions({ metroConfig: null }));

      // Should declare rawConfig as empty object
      expect(content).toContain('let rawConfig = {};');
      // Should NOT attempt to require a user metro config file (no try block)
      expect(content).not.toContain('try {');
      expect(content).not.toContain('} catch (e)');
    });

    it('still contains mergeConfig and captureSerializer imports', () => {
      const content = buildTempConfigContent(makeOptions({ metroConfig: null }));

      expect(content).toContain("require('@react-native/metro-config')");
      expect(content).toMatch(/require\(.*serializer\.js.*\)/);
    });
  });

  // ── Test 2: Metro config present ───────────────────────────────────────────
  describe('2. metroConfig path provided', () => {
    it('includes require() with the exact config path', () => {
      const content = buildTempConfigContent(
        makeOptions({ metroConfig: '/project/metro.config.js' }),
      );

      expect(content).toContain("require(\"/project/metro.config.js\")");
    });

    it('includes try-catch around the require block', () => {
      const content = buildTempConfigContent(
        makeOptions({ metroConfig: '/project/metro.config.js' }),
      );

      expect(content).toContain('try {');
      expect(content).toContain('} catch (e) {');
    });
  });

  // ── Test 3: captureSerializer called with statsOutputPath ──────────────────
  describe('3. captureSerializer invocation', () => {
    it('passes the statsOutputPath to captureSerializer', () => {
      const statsPath = '/tmp/my-project/stats.json';
      const content = buildTempConfigContent(makeOptions({ statsOutputPath: statsPath }));

      expect(content).toContain(JSON.stringify(statsPath));
    });

    it('passes the platform to captureSerializer', () => {
      const content = buildTempConfigContent(makeOptions({ platform: 'android' }));

      expect(content).toContain('"android"');
    });

    it('assigns the result to captureWrapped', () => {
      const content = buildTempConfigContent(makeOptions());

      expect(content).toContain('const captureWrapped = captureSerializer(');
    });
  });

  // ── Test 4: mergeConfig called ─────────────────────────────────────────────
  describe('4. mergeConfig usage', () => {
    it('destructures mergeConfig from @react-native/metro-config', () => {
      const content = buildTempConfigContent(makeOptions());

      expect(content).toContain('const { mergeConfig } = require(\'@react-native/metro-config\')');
    });

    it('calls mergeConfig with rawConfig and serializer override', () => {
      const content = buildTempConfigContent(makeOptions());

      expect(content).toContain('mergeConfig(rawConfig,');
      expect(content).toContain('customSerializer: captureWrapped');
    });
  });

  // ── Test 5: Async config error message ─────────────────────────────────────
  describe('5. async metro config error', () => {
    it('includes the async config error message when metro config is provided', () => {
      const content = buildTempConfigContent(
        makeOptions({ metroConfig: '/project/metro.config.js' }),
      );

      expect(content).toContain('metro-bundle-visualizer: async metro.config.js functions are not yet supported.');
      expect(content).toContain('Export a plain config object instead: module.exports = { ... }');
    });

    it('does not include async error message when metroConfig is null', () => {
      const content = buildTempConfigContent(makeOptions({ metroConfig: null }));

      expect(content).not.toContain('async metro.config.js functions are not yet supported');
    });

    it('re-throws errors that include "metro-bundle-visualizer" in the message', () => {
      const content = buildTempConfigContent(
        makeOptions({ metroConfig: '/project/metro.config.js' }),
      );

      expect(content).toContain("e.message.includes('metro-bundle-visualizer')");
    });
  });

  // ── Test 6: module.exports = mergeConfig(...) is the final export ──────────
  describe('6. module.exports assignment', () => {
    it('ends with module.exports = mergeConfig(...)', () => {
      const content = buildTempConfigContent(makeOptions());
      const trimmed = content.trimEnd();

      expect(trimmed).toContain('module.exports = mergeConfig(rawConfig,');
      // Check it appears after everything else (near the end of the file)
      const moduleExportsIndex = trimmed.lastIndexOf('module.exports');
      expect(moduleExportsIndex).toBeGreaterThan(trimmed.indexOf('captureWrapped'));
    });

    it('uses the "use strict" directive at the top', () => {
      const content = buildTempConfigContent(makeOptions());

      expect(content.trimStart().startsWith("'use strict';")).toBe(true);
    });
  });

  // ── Test 7: originalSerializer extraction ──────────────────────────────────
  describe('7. originalSerializer extraction', () => {
    it('extracts originalSerializer from rawConfig.serializer.customSerializer', () => {
      const content = buildTempConfigContent(makeOptions());

      expect(content).toContain(
        'const originalSerializer = rawConfig && rawConfig.serializer && rawConfig.serializer.customSerializer',
      );
    });
  });

  // ── Test 8: path escaping ───────────────────────────────────────────────────
  describe('8. paths with special characters', () => {
    it('JSON-encodes paths that might contain special characters', () => {
      const statsPath = '/tmp/project name/stats.json';
      const content = buildTempConfigContent(makeOptions({ statsOutputPath: statsPath }));

      // JSON.stringify will produce a valid JS string literal
      expect(content).toContain(JSON.stringify(statsPath));
    });

    it('JSON-encodes the metro config path', () => {
      const metroConfig = '/home/user/my project/metro.config.js';
      const content = buildTempConfigContent(makeOptions({ metroConfig }));

      expect(content).toContain(JSON.stringify(metroConfig));
    });
  });
});
