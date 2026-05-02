import fs from 'fs';
import path from 'path';
import os from 'os';
import { extractPackageName, captureSerializer } from '../src/serializer';

// ─── extractPackageName ────────────────────────────────────────────────────────

describe('extractPackageName', () => {
  it('returns the package name for an unscoped package', () => {
    expect(extractPackageName('/project/node_modules/lodash/cloneDeep.js')).toBe('lodash');
  });

  it('returns the scoped package name for a scoped package', () => {
    expect(
      extractPackageName('/project/node_modules/@react-navigation/native/src/index.js'),
    ).toBe('@react-navigation/native');
  });

  it('returns "<app>" for app code (no node_modules)', () => {
    expect(extractPackageName('/project/src/screens/HomeScreen.tsx')).toBe('<app>');
  });

  it('normalises Windows backslash paths', () => {
    expect(extractPackageName('C:\\project\\node_modules\\react\\index.js')).toBe('react');
  });

  it('returns the package name for an asset file inside node_modules', () => {
    expect(extractPackageName('/project/node_modules/react/images/logo.png')).toBe('react');
  });
});

// ─── captureSerializer ────────────────────────────────────────────────────────

function makeGraph(
  modules: Array<{
    id: string;
    code: string;
    type?: string;
  }>,
) {
  const dependencies = new Map<
    string,
    { output?: Array<{ type: string; data: { code: string } }> }
  >();

  for (const mod of modules) {
    dependencies.set(mod.id, {
      output: [{ type: mod.type ?? 'js/module', data: { code: mod.code } }],
    });
  }

  return { dependencies };
}

describe('captureSerializer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mbv-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes correct stats JSON with 2 modules, totalBytes and platform', async () => {
    const statsPath = path.join(tmpDir, 'output', 'stats.json');
    const originalSerializer = jest.fn().mockResolvedValue('bundle-output');

    const graph = makeGraph([
      { id: '/project/node_modules/lodash/lodash.js', code: 'var x=1;' },
      { id: '/project/src/index.js', code: 'console.log("hi");' },
    ]);

    const serializer = captureSerializer(originalSerializer, statsPath, 'ios');
    await serializer('index.js', [], graph, { platform: 'ios' });

    const raw = fs.readFileSync(statsPath, 'utf8');
    const stats = JSON.parse(raw);

    expect(stats.platform).toBe('ios');
    expect(stats.modules).toHaveLength(2);

    const totalBytes = Buffer.byteLength('var x=1;', 'utf8') + Buffer.byteLength('console.log("hi");', 'utf8');
    expect(stats.totalBytes).toBe(totalBytes);

    const lodashMod = stats.modules.find((m: { package: string }) => m.package === 'lodash');
    expect(lodashMod).toBeDefined();
    expect(lodashMod.size).toBe(Buffer.byteLength('var x=1;', 'utf8'));

    const appMod = stats.modules.find((m: { package: string }) => m.package === '<app>');
    expect(appMod).toBeDefined();
  });

  it('skips asset outputs and only counts js/module or js/script type', async () => {
    const statsPath = path.join(tmpDir, 'stats.json');
    const originalSerializer = jest.fn().mockResolvedValue('bundle');

    // This module has an asset output — should be skipped (code = '')
    const dependencies = new Map<
      string,
      { output?: Array<{ type: string; data: { code: string } }> }
    >();
    dependencies.set('/project/assets/logo.png', {
      output: [{ type: 'asset/data', data: { code: 'binary' } }],
    });
    dependencies.set('/project/node_modules/react/index.js', {
      output: [{ type: 'js/module', data: { code: 'react code' } }],
    });

    const graph = { dependencies };
    const serializer = captureSerializer(originalSerializer, statsPath, 'android');
    await serializer('index.js', [], graph, { platform: 'android' });

    const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));

    // The asset module has code='' so size=0; react has actual code
    const assetMod = stats.modules.find((m: { path: string }) => m.path.includes('logo.png'));
    expect(assetMod.size).toBe(0);

    const reactMod = stats.modules.find((m: { package: string }) => m.package === 'react');
    expect(reactMod.size).toBe(Buffer.byteLength('react code', 'utf8'));
  });

  it('calls the original serializer and passes through its return value', async () => {
    const statsPath = path.join(tmpDir, 'stats.json');
    const originalSerializer = jest.fn().mockResolvedValue('__original_bundle__');

    const graph = makeGraph([{ id: '/project/src/index.js', code: 'let a=1;' }]);
    const serializer = captureSerializer(originalSerializer, statsPath, 'ios');
    const result = await serializer('index.js', [], graph, { platform: 'ios' });

    expect(originalSerializer).toHaveBeenCalledTimes(1);
    expect(result).toBe('__original_bundle__');
  });

  it('uses fallback concatenation when no original serializer is provided', async () => {
    const statsPath = path.join(tmpDir, 'stats.json');

    const graph = makeGraph([
      { id: '/project/src/a.js', code: 'var a=1;' },
      { id: '/project/src/b.js', code: 'var b=2;' },
    ]);

    const serializer = captureSerializer(undefined, statsPath, 'ios');
    const result = await serializer('index.js', [], graph, { platform: 'ios' });

    // Fallback joins all codes with '\n'
    expect(result).toContain('var a=1;');
    expect(result).toContain('var b=2;');
  });

  it('creates the parent directory with mkdirSync when it does not exist', async () => {
    const nestedStatsPath = path.join(tmpDir, 'deep', 'nested', 'dir', 'stats.json');
    const originalSerializer = jest.fn().mockResolvedValue('bundle');

    const graph = makeGraph([{ id: '/project/src/index.js', code: 'x' }]);
    const serializer = captureSerializer(originalSerializer, nestedStatsPath, 'ios');
    await serializer('index.js', [], graph, { platform: 'ios' });

    expect(fs.existsSync(nestedStatsPath)).toBe(true);
  });
});
