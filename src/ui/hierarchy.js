(function (root) {
  'use strict';

  function categoryOf(name) {
    if (!name) return 'other';
    if (name === '<app>') return 'app';
    if (name === 'react-native' || name.startsWith('@react-native/')) return 'react-native';
    if (name.startsWith('@babel/')) return 'babel';
    if (name.startsWith('@')) return 'scoped';
    return 'other';
  }

  function buildHierarchy(stats) {
    const pkgMap = new Map();
    for (const mod of stats.modules || []) {
      const existing = pkgMap.get(mod.package);
      if (existing) {
        existing.size += mod.size;
        existing.files.push(mod);
      } else {
        pkgMap.set(mod.package, { name: mod.package, size: mod.size, files: [mod] });
      }
    }

    const catMap = new Map();
    for (const pkg of pkgMap.values()) {
      const cat = categoryOf(pkg.name);
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat).push(pkg);
    }

    const children = [];
    for (const [cat, pkgs] of catMap) {
      children.push({
        name: cat,
        _isCategory: true,
        children: pkgs.map(pkg => ({
          name: pkg.name,
          size: pkg.size,
          _isPackage: true,
          files: pkg.files,
          children: pkg.files.map(f => ({
            name: f.path,
            size: f.size,
            _pkg: pkg.name,
            files: [f],
          })),
        })),
      });
    }

    return { name: 'root', children };
  }

  function applyFilters(tree, opts) {
    const minSize = (opts && opts.minSize) || 0;
    const hidden = new Set((opts && opts.hiddenCategories) || []);

    let visiblePackages = 0;
    let groupedPackages = 0;
    let totalPackages = 0;
    let hiddenCategoryCount = 0;

    const children = [];
    for (const cat of tree.children) {
      totalPackages += cat.children.length;
      if (hidden.has(cat.name)) {
        hiddenCategoryCount += 1;
        continue;
      }
      const kept = [];
      const small = [];
      for (const pkg of cat.children) {
        if (pkg.size >= minSize) kept.push(pkg);
        else small.push(pkg);
      }
      visiblePackages += kept.length;
      groupedPackages += small.length;

      const catChildren = kept.slice();
      if (small.length > 0) {
        catChildren.push({
          name: 'Other (' + small.length + ' small package' + (small.length === 1 ? '' : 's') + ')',
          size: small.reduce((s, p) => s + p.size, 0),
          _isPackage: true,
          _isOther: true,
          _groupedPackages: small,
          files: [],
          children: [],
        });
      }
      children.push({ name: cat.name, _isCategory: true, children: catChildren });
    }

    return {
      name: 'root',
      children,
      _summary: {
        visiblePackages,
        groupedPackages,
        hiddenCategories: hiddenCategoryCount,
        totalPackages,
      },
    };
  }

  function rollupFiles(files, minSize) {
    const kept = [];
    const small = [];
    for (const f of files) {
      if (f.size >= minSize) kept.push(f);
      else small.push(f);
    }
    if (small.length === 0) return kept;
    kept.push({
      name: 'Other (' + small.length + ' small file' + (small.length === 1 ? '' : 's') + ')',
      size: small.reduce((s, f) => s + f.size, 0),
      _isOther: true,
      _groupedFiles: small,
    });
    return kept;
  }

  const api = { categoryOf, buildHierarchy, applyFilters, rollupFiles };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MBV_HIERARCHY = api;
})(typeof window !== 'undefined' ? window : globalThis);
