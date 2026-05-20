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

    const app = tree.children.find((c: any) => c.name === 'app');
    expect(app.children).toHaveLength(1);
    expect(app.children[0].name).toBe('<app>');
    expect(app.children[0].children).toHaveLength(2);
  });

  it('sums package size from its files', () => {
    const tree = buildHierarchy(stats);
    const babel = tree.children.find((c: any) => c.name === 'babel');
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
