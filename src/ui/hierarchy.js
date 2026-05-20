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

  const api = { categoryOf, buildHierarchy };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MBV_HIERARCHY = api;
})(typeof window !== 'undefined' ? window : globalThis);
