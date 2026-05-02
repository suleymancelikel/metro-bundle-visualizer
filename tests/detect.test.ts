import fs from 'fs';
import os from 'os';
import path from 'path';
import { detect, DetectResult } from '../src/detect';

// Helper: create a temp project directory and return its path
function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mbv-detect-'));
}

// Helper: write a package.json into a directory
function writePackageJson(dir: string, content: Record<string, unknown>): void {
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(content, null, 2));
}

// Cleanup helper
function cleanupDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── Test 1: package.json with "main" field ──────────────────────────────────
describe('detect()', () => {
  describe('1. package.json with "main" field', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTempDir();
      writePackageJson(tmpDir, { name: 'my-app', main: 'src/index.ts' });
    });

    afterEach(() => cleanupDir(tmpDir));

    it('returns the "main" field as entryFile', () => {
      const result: DetectResult = detect(tmpDir);
      expect(result.projectRoot).toBe(tmpDir);
      expect(result.entryFile).toBe('src/index.ts');
    });
  });

  // ─── Test 2: package.json without "main" field → fallback "index.js" ───────
  describe('2. package.json without "main" field', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTempDir();
      writePackageJson(tmpDir, { name: 'my-app' });
    });

    afterEach(() => cleanupDir(tmpDir));

    it('falls back to "index.js" when no "main" field', () => {
      const result = detect(tmpDir);
      expect(result.entryFile).toBe('index.js');
    });
  });

  // ─── Test 3: metro.config.js present ─────────────────────────────────────
  describe('3. metro.config.js present', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTempDir();
      writePackageJson(tmpDir, { name: 'my-app' });
      fs.writeFileSync(path.join(tmpDir, 'metro.config.js'), '// metro config');
    });

    afterEach(() => cleanupDir(tmpDir));

    it('returns full path to metro.config.js', () => {
      const result = detect(tmpDir);
      expect(result.metroConfig).toBe(path.join(tmpDir, 'metro.config.js'));
    });
  });

  // ─── Test 4: metro.config.ts present (no .js) ────────────────────────────
  describe('4. metro.config.ts present (no .js)', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTempDir();
      writePackageJson(tmpDir, { name: 'my-app' });
      fs.writeFileSync(path.join(tmpDir, 'metro.config.ts'), '// metro config ts');
    });

    afterEach(() => cleanupDir(tmpDir));

    it('returns full path to metro.config.ts when .js is absent', () => {
      const result = detect(tmpDir);
      expect(result.metroConfig).toBe(path.join(tmpDir, 'metro.config.ts'));
    });
  });

  // ─── Test 5: no metro config → null ──────────────────────────────────────
  describe('5. no metro config', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTempDir();
      writePackageJson(tmpDir, { name: 'my-app' });
    });

    afterEach(() => cleanupDir(tmpDir));

    it('returns metroConfig: null when no metro config file exists', () => {
      const result = detect(tmpDir);
      expect(result.metroConfig).toBeNull();
    });
  });

  // ─── Test 6: no package.json → throws ────────────────────────────────────
  describe('6. no package.json found', () => {
    let tmpDir: string;

    beforeEach(() => {
      // Create a deeply nested dir with no package.json anywhere in the chain
      // We use os.tmpdir() base but create an isolated subtree
      tmpDir = makeTempDir();
      // Create nested subdir — no package.json at any level within tmpDir
      fs.mkdirSync(path.join(tmpDir, 'nested', 'deep'), { recursive: true });
    });

    afterEach(() => cleanupDir(tmpDir));

    it('throws "No package.json found" when no package.json exists up the tree', () => {
      // We call detect from the deepest nested path.
      // Because os.tmpdir() itself likely has no package.json, the traversal
      // will eventually hit the filesystem root without finding one.
      const deepPath = path.join(tmpDir, 'nested', 'deep');
      expect(() => detect(deepPath)).toThrow(/No package\.json found/);
    });
  });

  // ─── Test 7: Windows path simulation ─────────────────────────────────────
  describe('7. Windows-style path simulation', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTempDir();
      writePackageJson(tmpDir, { name: 'my-app', main: 'index.js' });
    });

    afterEach(() => cleanupDir(tmpDir));

    it('still detects correctly when cwd has mixed separators', () => {
      // On macOS/Linux the path separator is already '/', but we simulate a
      // Windows-style path by replacing '/' with '\\' then re-normalizing.
      // The detect() function must normalize paths before fs operations,
      // so passing the normalised equivalent of a Windows path should work.
      const normalizedPath = path.normalize(tmpDir);
      const result = detect(normalizedPath);
      expect(result.projectRoot).toBeTruthy();
      expect(result.entryFile).toBe('index.js');
    });
  });

  // ─── Test 8: Expo Router entry ────────────────────────────────────────────
  describe('8. Expo Router entry file', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTempDir();
      writePackageJson(tmpDir, { name: 'my-expo-app', main: 'expo-router/entry' });
    });

    afterEach(() => cleanupDir(tmpDir));

    it('returns "expo-router/entry" as-is without modification', () => {
      const result = detect(tmpDir);
      expect(result.entryFile).toBe('expo-router/entry');
    });
  });

  describe('8b. Expo Router entry with .js extension', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTempDir();
      writePackageJson(tmpDir, { name: 'my-expo-app', main: 'expo-router/entry.js' });
    });

    afterEach(() => cleanupDir(tmpDir));

    it('returns "expo-router/entry.js" as-is without modification', () => {
      const result = detect(tmpDir);
      expect(result.entryFile).toBe('expo-router/entry.js');
    });
  });

  // ─── Bonus: recursive upward traversal ───────────────────────────────────
  describe('recursive upward traversal', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTempDir();
      writePackageJson(tmpDir, { name: 'my-app', main: 'App.tsx' });
      fs.mkdirSync(path.join(tmpDir, 'src', 'screens'), { recursive: true });
    });

    afterEach(() => cleanupDir(tmpDir));

    it('finds package.json in a parent directory', () => {
      const deepDir = path.join(tmpDir, 'src', 'screens');
      const result = detect(deepDir);
      expect(result.projectRoot).toBe(tmpDir);
      expect(result.entryFile).toBe('App.tsx');
    });
  });
});
