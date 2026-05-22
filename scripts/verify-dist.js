'use strict';
const fs = require('fs');

const required = [
  'dist/ui/template.html',
  'dist/ui/styles.css',
  'dist/ui/treemap.js',
  'dist/ui/d3.min.js',
];

for (const f of required) {
  fs.statSync(f);
  console.log('ok', f);
}
