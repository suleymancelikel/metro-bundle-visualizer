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

  const api = { categoryOf };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MBV_HIERARCHY = api;
})(typeof window !== 'undefined' ? window : globalThis);
