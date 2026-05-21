import { categoryOf } from '../src/ui/hierarchy';

describe('categoryOf', () => {
  it('classifies <app> as "app"', () => {
    expect(categoryOf('<app>')).toBe('app');
  });

  it('classifies react-native and @react-native/* as "react-native"', () => {
    expect(categoryOf('react-native')).toBe('react-native');
    expect(categoryOf('@react-native/virtualized-lists')).toBe('react-native');
  });

  it('classifies @babel/* as "babel"', () => {
    expect(categoryOf('@babel/runtime')).toBe('babel');
  });

  it('classifies other scoped packages as "scoped"', () => {
    expect(categoryOf('@sentry/react-native')).toBe('scoped');
  });

  it('classifies bare packages as "other"', () => {
    expect(categoryOf('lodash')).toBe('other');
    expect(categoryOf('react')).toBe('other');
  });

  it('falls back to "other" for empty/null', () => {
    expect(categoryOf('')).toBe('other');
    expect(categoryOf(null as unknown as string)).toBe('other');
  });
});

import { buildHierarchy } from '../src/ui/hierarchy';

describe('buildHierarchy', () => {
  const stats = {
    modules: [
      { path: '/app/index.js', size: 800, package: '<app>' },
      { path: '/app/util.js',  size: 200, package: '<app>' },
      { path: '/node_modules/react/index.js', size: 700, package: 'react' },
      { path: '/node_modules/@babel/runtime/a.js', size: 50, package: '@babel/runtime' },
      { path: '/node_modules/@babel/runtime/b.js', size: 30, package: '@babel/runtime' },
    ],
  };

  it('groups by category, then package, then file', () => {
    const tree = buildHierarchy(stats);
    expect(tree.name).toBe('root');
    expect(tree.children.map((c: any) => c.name).sort()).toEqual(
      ['app', 'babel', 'other'].sort()
    );

    const app = tree.children.find((c: any) => c.name === 'app')!;
    expect(app.children).toHaveLength(1);
    expect(app.children[0].name).toBe('<app>');
    expect(app.children[0].children).toHaveLength(2);
  });

  it('sums package size from its files', () => {
    const tree = buildHierarchy(stats);
    const babel = tree.children.find((c: any) => c.name === 'babel')!;
    const runtime = babel.children[0];
    expect(runtime.name).toBe('@babel/runtime');
    expect(runtime.size).toBe(80);
  });

  it('marks package nodes with _isPackage and file nodes with _pkg', () => {
    const tree = buildHierarchy(stats);
    const pkg = tree.children[0].children[0];
    expect(pkg._isPackage).toBe(true);
    expect(pkg.children[0]._pkg).toBe(pkg.name);
  });

  it('returns empty children for empty input', () => {
    const tree = buildHierarchy({ modules: [] });
    expect(tree.children).toEqual([]);
  });
});

import { applyFilters } from '../src/ui/hierarchy';

describe('applyFilters', () => {
  const baseTree = {
    name: 'root',
    children: [
      {
        name: 'other', _isCategory: true,
        children: [
          { name: 'big',   size: 50_000, _isPackage: true, files: [], children: [] },
          { name: 'small', size: 1_000,  _isPackage: true, files: [], children: [] },
          { name: 'tiny',  size: 200,    _isPackage: true, files: [], children: [] },
        ],
      },
      {
        name: 'app', _isCategory: true,
        children: [{ name: '<app>', size: 100_000, _isPackage: true, files: [], children: [] }],
      },
    ],
  };

  it('removes hidden categories entirely', () => {
    const out = applyFilters(baseTree, { minSize: 0, hiddenCategories: ['app'] });
    expect(out.children.map((c: any) => c.name)).toEqual(['other']);
  });

  it('rolls packages below minSize into "Other" within each category', () => {
    const out = applyFilters(baseTree, { minSize: 5_000, hiddenCategories: [] });
    const other = out.children.find((c: any) => c.name === 'other')!;
    expect(other.children.map((p: any) => p.name).sort())
      .toEqual(['Other (2 small packages)', 'big'].sort());
    const rollup = other.children.find((p: any) => p.name.startsWith('Other'))!;
    expect(rollup.size).toBe(1_200);
    expect(rollup._isOther).toBe(true);
    expect(rollup._groupedPackages).toHaveLength(2);
  });

  it('does not create a rollup if no packages are below threshold', () => {
    const out = applyFilters(baseTree, { minSize: 100, hiddenCategories: [] });
    const other = out.children.find((c: any) => c.name === 'other')!;
    expect(other.children.find((p: any) => p._isOther)).toBeUndefined();
  });

  it('returns a new tree (does not mutate input)', () => {
    const before = JSON.stringify(baseTree);
    applyFilters(baseTree, { minSize: 5_000, hiddenCategories: ['app'] });
    expect(JSON.stringify(baseTree)).toBe(before);
  });

  it('reports a summary of filter results', () => {
    const out = applyFilters(baseTree, { minSize: 5_000, hiddenCategories: ['app'] });
    expect(out._summary).toEqual({
      visiblePackages: 1,
      groupedPackages: 2,
      hiddenCategories: 1,
      totalPackages: 4,
    });
  });
});

import { rollupFiles } from '../src/ui/hierarchy';

describe('rollupFiles', () => {
  it('groups files below minSize into an Other node', () => {
    const files = [
      { name: 'a.js', size: 5000 },
      { name: 'b.js', size: 500 },
      { name: 'c.js', size: 300 },
    ];
    const out = rollupFiles(files, 1024);
    expect(out.map((n: any) => n.name)).toEqual(['a.js', 'Other (2 small files)']);
    const other = out[1];
    expect(other._isOther).toBe(true);
    expect(other.size).toBe(800);
  });

  it('returns input unchanged when nothing below threshold', () => {
    const files = [{ name: 'a.js', size: 5000 }];
    const out = rollupFiles(files, 1024);
    expect(out).toHaveLength(1);
    expect(out[0]._isOther).toBeUndefined();
  });
});
