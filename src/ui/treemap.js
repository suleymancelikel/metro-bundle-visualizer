(function () {
  'use strict';

  // --- Helpers ---
  function formatBytes(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
  }

  function formatBytesDetailed(bytes) {
    if (bytes >= 1024 * 1024) return { value: (bytes / 1024 / 1024).toFixed(2), unit: 'MB' };
    if (bytes >= 1024)        return { value: (bytes / 1024).toFixed(0),        unit: 'KB' };
    return { value: String(bytes), unit: 'B' };
  }

  const KNOWN_HEAVY = {
    'moment':                  { alt: 'date-fns or dayjs', reason: 'Includes all locales by default (~300 KB parsed).' },
    'lodash':                  { alt: 'lodash-es with tree-shaking or per-function imports', reason: 'Full lodash is ~72 KB; most apps use <10 functions.' },
    'lodash-es':               { alt: 'per-function imports (lodash-es/debounce)', reason: 'Without tree-shaking in Metro, the full library is bundled.' },
    'react-native-vector-icons': { alt: 'react-native-svg icons or @expo/vector-icons subset', reason: 'Font files can add 1-2 MB to the bundle assets.' },
    'react-native-paper':      { alt: 'import only used components', reason: 'Full library is large; use named imports to enable tree-shaking.' },
    'firebase':                { alt: 'import only the modules you use (firebase/firestore)', reason: 'Importing the full firebase package includes unused SDKs.' },
    '@firebase/app':           { alt: 'use modular firebase imports', reason: 'Legacy compat layer is significantly larger than modular API.' },
    'axios':                   { alt: 'fetch API (built-in)', reason: 'React Native includes fetch. Axios adds ~14 KB for XHR shims.' },
    'underscore':              { alt: 'lodash or native ES methods', reason: 'Fully replaced by lodash and ES6+ methods.' },
    'uuid':                    { alt: 'crypto.randomUUID() or nanoid', reason: 'uuid is large and includes polyfills; nanoid is ~130 bytes.' },
    'nanoid':                  { alt: '', reason: 'Already a good small choice - make sure you only import the core.' },
    'classnames':              { alt: 'clsx', reason: 'clsx is half the size with the same API.' },
    '@sentry/react-native':    { alt: '', reason: 'Large but necessary. Ensure source maps are configured so only the core is included.' },
    'react-redux':             { alt: '', reason: 'Healthy. Ensure you are not accidentally bundling the dev tools build.' },
    'immer':                   { alt: '', reason: 'Healthy. Make sure you are using the ES module build.' },
    'rxjs':                    { alt: 'use only the operators you need', reason: 'Full RxJS is ~200 KB; tree-shaking requires explicit operator imports.' },
    '@react-navigation/stack': { alt: '@react-navigation/native-stack', reason: 'native-stack uses the native iOS/Android navigator and is smaller.' },
  };

  const stats = window.__BUNDLE_STATS__;
  if (!stats) return;

  const budget = window.__BUNDLE_BUDGET__ != null ? window.__BUNDLE_BUDGET__ : null;

  if (budget !== null && stats.totalBytes > budget) {
    const stripEl = document.getElementById('budget-strip');
    const msgEl   = document.getElementById('budget-strip-msg');
    if (stripEl) stripEl.style.display = 'flex';
    if (msgEl) {
      const over = stats.totalBytes - budget;
      msgEl.textContent =
        'Bundle exceeds budget by ' + formatBytes(over) +
        ' (' + formatBytes(stats.totalBytes) + ' / ' + formatBytes(budget) + ' limit)';
    }
  }

  const prevStats = window.__PREV_STATS__ || null;

  const prevPkgMap = new Map();
  if (prevStats && prevStats.modules) {
    for (const mod of prevStats.modules) {
      const existing = prevPkgMap.get(mod.package);
      if (existing) {
        existing.size += mod.size;
      } else {
        prevPkgMap.set(mod.package, { size: mod.size });
      }
    }
  }

  // --- XSS-safe escape helper ---
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // --- Data layer ---
  const fullHierarchy = window.MBV_HIERARCHY.buildHierarchy(stats);

  const pkgMap = new Map();
  for (const cat of fullHierarchy.children) {
    for (const pkg of cat.children) {
      pkgMap.set(pkg.name, pkg);
    }
  }

  // UI state — drives applyFilters re-runs
  let minSizeBytes = 10 * 1024;
  const hiddenCategories = new Set();

  // Pre-compute lowercase path cache once at init
  const pkgFilePathCache = new Map();
  for (const [name, pkg] of pkgMap) {
    pkgFilePathCache.set(name, (pkg.files || []).map(f => (f.path || '').toLowerCase()));
  }

  function currentFilteredTree() {
    return window.MBV_HIERARCHY.applyFilters(fullHierarchy, {
      minSize: minSizeBytes,
      hiddenCategories: [...hiddenCategories],
    });
  }

  let filteredTree = currentFilteredTree();
  let root = d3.hierarchy(filteredTree)
    .sum(d => (d.children && d.children.length) ? 0 : (d.size || 0))
    .sort((a, b) => (b.value || 0) - (a.value || 0));

  // --- Semantic color by package category ---
  function categoryColor(name) {
    if (!name)                              return '#3a3a44';
    if (name === '<app>')                   return '#ff6b35';
    if (name.startsWith('@react-native/') ||
        name === 'react-native')            return '#4a5568';
    if (name.startsWith('@babel/'))         return '#6b46c1';
    if (name.startsWith('@'))               return '#0891b2';
    return '#2d6a8c';
  }

  function categoryToColorKey(cat) {
    if (cat === 'app') return '<app>';
    if (cat === 'react-native') return 'react-native';
    if (cat === 'babel') return '@babel/runtime';
    if (cat === 'scoped') return '@anything';
    return 'unscoped';
  }

  // --- Wire header ---
  const heroParts = formatBytesDetailed(stats.totalBytes);
  const heroValEl  = document.getElementById('hero-value');
  const heroUnitEl = document.getElementById('hero-unit');
  const heroSubEl  = document.getElementById('hero-sub');
  const platformEl = document.getElementById('platform-badge');
  const metaEl     = document.getElementById('meta');
  const footerEl   = document.getElementById('footer');

  if (heroValEl)   heroValEl.textContent  = heroParts.value;
  if (heroUnitEl)  heroUnitEl.textContent = heroParts.unit;
  if (heroSubEl)   heroSubEl.textContent  = stats.modules.length + ' modules · ' + pkgMap.size + ' packages';
  // hero header now renders inline: value · modules · packages (see .hero-stat in styles.css)
  if (platformEl)  platformEl.textContent = stats.platform || '';
  if (metaEl)      metaEl.textContent     = 'platform: ' + (stats.platform || '—');
  if (footerEl)    footerEl.textContent   = 'Generated ' + new Date(stats.generatedAt).toLocaleString() + ' · Sizes are pre-minification (~20–40% larger than shipped binary)';

  // Populate sidebar overview
  (function () {
    const ovSizeVal  = document.getElementById('ov-size-val');
    const ovSizeUnit = document.getElementById('ov-size-unit');
    const ovModules  = document.getElementById('ov-modules');
    const ovPkgs     = document.getElementById('ov-packages');
    const topList    = document.getElementById('sb-top-list');

    const sizeD = formatBytesDetailed(stats.totalBytes);
    if (ovSizeVal)  ovSizeVal.textContent  = sizeD.value;
    if (ovSizeUnit) ovSizeUnit.textContent = sizeD.unit;
    if (ovModules)  ovModules.textContent  = String(stats.modules.length);
    if (ovPkgs)     ovPkgs.textContent     = String(pkgMap.size);

    if (topList) {
      const sorted = [...pkgMap.values()].sort((a, b) => b.size - a.size).slice(0, 10);
      const maxSz = sorted[0] ? sorted[0].size : 1;
      for (const pkg of sorted) {
        const li = document.createElement('li');
        li.className = 'file-bar';
        li.style.setProperty('--bar', (pkg.size / maxSz * 100).toFixed(1) + '%');
        li.style.cursor = 'pointer';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-bar__name';
        nameSpan.textContent = pkg.name;

        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'file-bar__size';
        sizeSpan.textContent = formatBytes(pkg.size);

        li.appendChild(nameSpan);
        li.appendChild(sizeSpan);
        li.addEventListener('click', () => {
          showSidebar(pkg);
          if (viewMode === 'grouped') {
            const cat = window.MBV_HIERARCHY.categoryOf(pkg.name);
            drillPath = [cat, pkg.name];
          } else {
            drillPath = [pkg.name];
          }
          updateBreadcrumb();
          render(currentFilter);
          encodeState();
        });
        topList.appendChild(li);
      }
    }
  })();

  // --- Tooltip ---
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  document.body.appendChild(tooltip);

  // --- SVG setup ---
  const container = document.getElementById('treemap-container');
  if (!container) return;

  let width = container.clientWidth || 800;
  let height = container.clientHeight || 600;

  const svg = d3.select('#treemap-container').append('svg')
    .attr('width', width)
    .attr('height', height);

  const g = svg.append('g');

  let currentFilter = '';
  let selectedNode = null;
  let tooltipRafId = null;
  // viewMode: 'flat' (default — packages across all categories) or 'grouped' (3-level category drill).
  let viewMode = 'flat';
  // Drill path semantics:
  //   flat:    [] = all packages; [pkgName] = files of package
  //   grouped: [] = categories; [cat] = packages in cat; [cat, pkgName] = files of package
  let drillPath = [];

  function maxDrillDepth() {
    return viewMode === 'flat' ? 1 : 2;
  }

  function drillInto(name) {
    if (drillPath.length >= maxDrillDepth()) return;
    drillPath = drillPath.concat([name]);
    updateBreadcrumb();
    render(currentFilter);
    encodeState();
  }

  function drillToLevel(level) {
    drillPath = drillPath.slice(0, level);
    updateBreadcrumb();
    render(currentFilter);
    encodeState();
  }

  function updateBreadcrumb() {
    const bc = document.getElementById('breadcrumb');
    if (!bc) return;
    while (bc.firstChild) bc.removeChild(bc.firstChild);
    if (drillPath.length === 0) return;

    const sep0 = document.createElement('span');
    sep0.className = 'breadcrumb__sep';
    sep0.textContent = '›';
    bc.appendChild(sep0);
    const home = document.createElement('button');
    home.className = 'breadcrumb__seg breadcrumb__seg--home';
    home.textContent = 'All';
    home.title = viewMode === 'grouped' ? 'Back to categories' : 'Back to all packages';
    home.addEventListener('click', () => drillToLevel(0));
    bc.appendChild(home);

    for (let i = 0; i < drillPath.length; i++) {
      const sep = document.createElement('span');
      sep.className = 'breadcrumb__sep';
      sep.textContent = '›';
      bc.appendChild(sep);
      const btn = document.createElement('button');
      btn.className = 'breadcrumb__seg';
      if (i === drillPath.length - 1) btn.classList.add('breadcrumb__seg--current');
      btn.textContent = drillPath[i];
      const targetLevel = i + 1;
      btn.addEventListener('click', () => {
        if (targetLevel === drillPath.length) return;
        drillToLevel(targetLevel);
      });
      bc.appendChild(btn);
    }
  }

  function setViewMode(mode) {
    if (mode === viewMode) return;
    viewMode = mode;
    drillPath = [];
    const btn = document.getElementById('view-toggle');
    const lbl = document.getElementById('view-toggle-label');
    if (btn) btn.setAttribute('aria-pressed', viewMode === 'grouped' ? 'true' : 'false');
    if (lbl) lbl.textContent = viewMode === 'grouped' ? 'Ungroup' : 'Group by category';
    updateBreadcrumb();
    render(currentFilter);
    encodeState();
  }

  function sliderValueFromBytes(bytes) {
    if (bytes <= 0) return 0;
    return Math.round(Math.log(bytes / 1024 + 1) / Math.log(2) * 10);
  }
  function bytesFromSliderValue(v) {
    if (v <= 0) return 0;
    return Math.round((Math.pow(2, v / 10) - 1) * 1024);
  }

  function rebuildAndRender() {
    filteredTree = currentFilteredTree();
    root = d3.hierarchy(filteredTree)
      .sum(d => (d.children && d.children.length) ? 0 : (d.size || 0))
      .sort((a, b) => (b.value || 0) - (a.value || 0));
    updateFilterSummary();
    updateResetVisibility();
    render(currentFilter);
  }

  function updateFilterSummary() {
    const el = document.getElementById('sb-filter-summary');
    if (!el || !filteredTree._summary) return;
    const s = filteredTree._summary;
    if (s.visiblePackages === s.totalPackages) {
      el.textContent = 'Click a package to inspect its files';
      return;
    }
    el.textContent = 'Showing ' + s.visiblePackages + ' of ' + s.totalPackages +
      ' packages (' + s.groupedPackages + ' grouped' +
      (s.hiddenCategories ? ', ' + s.hiddenCategories + ' categories hidden' : '') + ')';
  }

  function updateResetVisibility() {
    const btn = document.getElementById('controls-reset');
    if (!btn) return;
    const hasFilters = minSizeBytes > 0 || hiddenCategories.size > 0;
    btn.style.display = hasFilters ? 'inline-block' : 'none';
  }

  // --- Render function (level-aware) ---
  function render(filterText) {
    currentFilter = (filterText || '').toLowerCase();
    g.selectAll('*').remove();
    svg.select('.treemap-empty-state').remove();

    const level = drillPath.length;
    let dataChildren;

    if (viewMode === 'flat') {
      if (level === 0) {
        // Flatten all visible packages across all categories.
        const pkgs = [];
        for (const cat of (root.children || [])) {
          for (const pkg of (cat.children || [])) {
            pkgs.push(pkg);
          }
        }
        dataChildren = pkgs.filter(c => {
          if (!currentFilter) return true;
          const name = (c.data.name || '').toLowerCase();
          if (name.includes(currentFilter)) return true;
          const paths = pkgFilePathCache.get(c.data.name) || [];
          return paths.some(p => p.includes(currentFilter));
        }).map(c => ({
          name: c.data.name,
          size: c.value || 0,
          _isPackage: true,
          _isOther: c.data._isOther,
          _groupedPackages: c.data._groupedPackages,
          files: c.data.files,
        }));
      } else {
        // Files of a single package: find it via pkgMap.
        const pkgName = drillPath[0];
        const pkg = pkgMap.get(pkgName);
        const rawFiles = pkg ? (pkg.files || []) : [];
        dataChildren = window.MBV_HIERARCHY.rollupFiles(rawFiles, 1024).map(f => ({
          name: f.name,
          size: f.size,
          _pkg: pkgName,
          _isFile: true,
          _isOther: f._isOther,
          _groupedFiles: f._groupedFiles,
        }));
      }
    } else {
      // grouped mode — original 3-level walk.
      let parent = root;
      for (const name of drillPath) {
        parent = (parent.children || []).find(c => c.data.name === name);
        if (!parent) {
          drillPath = [];
          parent = root;
          updateBreadcrumb();
          break;
        }
      }
      if (level === 0) {
        dataChildren = (parent.children || []).map(c => ({
          name: c.data.name,
          size: c.value || 0,
          _isCategoryBox: true,
        }));
      } else if (level === 1) {
        dataChildren = (parent.children || []).filter(c => {
          if (!currentFilter) return true;
          const name = (c.data.name || '').toLowerCase();
          if (name.includes(currentFilter)) return true;
          const paths = pkgFilePathCache.get(c.data.name) || [];
          return paths.some(p => p.includes(currentFilter));
        }).map(c => ({
          name: c.data.name,
          size: c.value || 0,
          _isPackage: true,
          _isOther: c.data._isOther,
          _groupedPackages: c.data._groupedPackages,
          files: c.data.files,
        }));
      } else {
        const rawFiles = (parent.children || []).map(c => c.data);
        dataChildren = window.MBV_HIERARCHY.rollupFiles(rawFiles, 1024).map(f => ({
          name: f.name,
          size: f.size,
          _pkg: drillPath[1],
          _isFile: true,
          _isOther: f._isOther,
          _groupedFiles: f._groupedFiles,
        }));
      }
    }

    // effLevel: 0=categories, 1=packages, 2=files. Decouples rendering from drill depth across viewModes.
    let effLevel;
    if (viewMode === 'grouped') effLevel = level;
    else effLevel = level === 0 ? 1 : 2;

    if (dataChildren.length === 0) {
      svg.append('text')
        .attr('class', 'treemap-empty-state')
        .attr('x', '50%').attr('y', '50%')
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .text(currentFilter ? 'No items match "' + currentFilter + '"' : 'No data');
      return;
    }

    const layoutRoot = d3.hierarchy({ name: 'root', children: dataChildren })
      .sum(d => (d.children && d.children.length) ? 0 : (d.size || 0))
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    d3.treemap()
      .size([width, height])
      .paddingOuter(effLevel === 0 ? 6 : 3)
      .paddingInner(effLevel === 0 ? 4 : 1)
      .round(true)(layoutRoot);

    const nodes = g.selectAll('.node')
      .data(layoutRoot.leaves())
      .join('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.x0},${d.y0})`);

    nodes.classed('node--other', d => !!d.data._isOther);

    nodes.append('rect')
      .attr('width', d => Math.max(0, d.x1 - d.x0))
      .attr('height', d => Math.max(0, d.y1 - d.y0))
      .attr('fill', d => {
        if (d.data._isCategoryBox) return categoryColor(categoryToColorKey(d.data.name));
        return categoryColor(d.data._pkg || d.data.name);
      })
      .attr('rx', effLevel === 0 ? 4 : 2);

    nodes.append('text')
      .attr('class', effLevel === 0 ? 'node-label node-label--cat' : 'node-label')
      .attr('x', effLevel === 0 ? 12 : 6).attr('y', effLevel === 0 ? 24 : 15)
      .text(d => {
        const w = d.x1 - d.x0 - 24;
        const charPx = effLevel === 0 ? 9 : 6.5;
        const minW = effLevel === 0 ? 50 : 30;
        if (w < minW) return '';
        const maxChars = Math.floor(w / charPx);
        if (maxChars < 4) return '';
        const name = (effLevel === 2)
          ? ((d.data.name || '').split('/').slice(-2).join('/'))
          : (d.data.name || '');
        return name.length <= maxChars ? name : name.slice(0, maxChars - 1) + '…';
      });

    nodes.append('text')
      .attr('class', effLevel === 0 ? 'node-size node-size--cat' : 'node-size')
      .attr('x', effLevel === 0 ? 12 : 6)
      .attr('y', effLevel === 0 ? 44 : 28)
      .text(d => {
        const w = d.x1 - d.x0, h = d.y1 - d.y0;
        const minW = effLevel === 0 ? 80 : 60;
        const minH = effLevel === 0 ? 60 : 36;
        if (w < minW || h < minH) return '';
        return formatBytes(d.value || 0);
      });

    if (prevStats && effLevel === 1) {
      nodes.append('text')
        .attr('class', function(d) {
          const pkgName = d.data._pkg || d.data.name;
          const prevPkg = prevPkgMap.get(pkgName);
          const delta = prevPkg !== undefined ? (d.value || 0) - prevPkg.size : null;
          if (delta === null) return 'node-delta node-delta--same';
          return delta > 0 ? 'node-delta node-delta--up' : delta < 0 ? 'node-delta node-delta--down' : 'node-delta node-delta--same';
        })
        .attr('x', d => Math.max(0, d.x1 - d.x0) - 6)
        .attr('y', 14)
        .attr('text-anchor', 'end')
        .text(function(d) {
          const w = d.x1 - d.x0, h = d.y1 - d.y0;
          if (w < 50 || h < 20) return '';
          const pkgName = d.data._pkg || d.data.name;
          const prevPkg = prevPkgMap.get(pkgName);
          if (prevPkg === undefined) return 'new';
          const delta = (d.value || 0) - prevPkg.size;
          if (Math.abs(delta) < 512) return '~';
          return (delta > 0 ? '+' : '') + formatBytes(delta);
        });
    }

    if (currentFilter && effLevel === 1) {
      nodes.classed('dimmed', d => {
        const pkgName = d.data._pkg || d.data.name || '';
        if (pkgName.toLowerCase().includes(currentFilter)) return false;
        const paths = pkgFilePathCache.get(pkgName) || [];
        return !paths.some(p => p.includes(currentFilter));
      });
    }

    nodes
      .on('mousemove', function (event, d) {
        const pkgName = d.data._pkg || d.data.name || '';
        const pct = d.value && stats.totalBytes ? (d.value / stats.totalBytes * 100).toFixed(1) : '0';
        tooltip.innerHTML =
          '<div class="tooltip__name">' + escapeHtml(effLevel === 2 ? (d.data.name || '').split('/').slice(-1)[0] : pkgName) + '</div>' +
          '<div class="tooltip__row"><span>Size</span><span>' + escapeHtml(formatBytes(d.value || 0)) + '</span></div>' +
          '<div class="tooltip__row"><span>Share</span><span>' + escapeHtml(pct) + '%</span></div>' +
          (effLevel === 2 ? '' : '<div class="tooltip__row"><span>Files</span><span>' + escapeHtml(String((pkgMap.get(pkgName) || { files: [] }).files.length)) + '</span></div>') +
          '<div class="tooltip__bar-track"><div class="tooltip__bar-fill" style="width:' + escapeHtml(pct) + '%"></div></div>';

        tooltip.classList.add('visible');
        if (tooltipRafId) cancelAnimationFrame(tooltipRafId);
        tooltip.style.transform = 'translate(-9999px,-9999px)';
        tooltipRafId = requestAnimationFrame(() => {
          tooltipRafId = null;
          const pad = 14, tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
          let x = event.clientX + pad, y = event.clientY + pad;
          if (x + tw > window.innerWidth - 8)  x = event.clientX - tw - pad;
          if (y + th > window.innerHeight - 8) y = event.clientY - th - pad;
          tooltip.style.transform = 'translate(' + x + 'px,' + y + 'px)';
        });
      })
      .on('mouseleave', () => tooltip.classList.remove('visible'))
      .on('click', function (_event, d) {
        if (d.data._isOther) {
          if (selectedNode) d3.select(selectedNode).classed('selected', false);
          selectedNode = this;
          d3.select(this).classed('selected', true);
          showOtherSidebar(d.data._groupedPackages);
          return;
        }
        if (level < 2 && !d.data._pkg) {
          drillInto(d.data.name);
          return;
        }
        if (selectedNode) d3.select(selectedNode).classed('selected', false);
        selectedNode = this;
        d3.select(this).classed('selected', true);
        const pkgName = d.data._pkg || d.data.name;
        const pkg = pkgMap.get(pkgName) || { name: pkgName, size: d.value, files: d.data.files || [] };
        showSidebar(pkg);
      });

    const countEl = document.getElementById('search-count');
    if (countEl) {
      if (currentFilter && effLevel === 1) {
        countEl.textContent = dataChildren.length + ' matches';
      } else {
        countEl.textContent = '';
      }
    }
  }

  // --- Sidebar ---
  function showSidebar(pkg) {
    const overview = document.getElementById('sb-overview');
    if (overview) overview.style.display = 'none';

    const sidebar     = document.getElementById('sidebar');
    const placeholder = document.querySelector('.sidebar-placeholder');
    const content     = document.querySelector('.sidebar-content');
    if (!sidebar || !content) return;

    sidebar.classList.remove('sidebar--empty');
    if (placeholder) placeholder.style.display = 'none';
    content.style.display = 'block';

    const sbBadge    = document.getElementById('sb-badge');
    const sbName     = document.getElementById('sb-name');
    const sbSizeEl   = document.getElementById('sb-size-val');
    const sbShareVal = document.getElementById('sb-share-val');
    const sbFilesVal = document.getElementById('sb-files-val');
    const sbFileList = document.getElementById('sb-file-list');

    if (sbBadge) {
      const n = pkg.name || '';
      sbBadge.textContent = n === '<app>' ? 'app' : n.startsWith('@') ? 'scope' : 'npm';
    }
    if (sbName) sbName.textContent = pkg.name || '';

    const warningEl      = document.getElementById('sb-warning');
    const warningTitle   = document.getElementById('sb-warning-title');
    const warningReason  = document.getElementById('sb-warning-reason');
    const warningAlt     = document.getElementById('sb-warning-alt');

    const knownKey = Object.keys(KNOWN_HEAVY).find(k =>
      pkg.name === k || pkg.name.startsWith(k + '/')
    );
    const knownEntry = knownKey ? KNOWN_HEAVY[knownKey] : null;

    if (warningEl) {
      if (knownEntry) {
        warningEl.style.display = 'flex';
        if (warningTitle)  warningTitle.textContent  = 'Consider replacing ' + (knownKey || pkg.name);
        if (warningReason) warningReason.textContent = knownEntry.reason;
        if (warningAlt)    warningAlt.textContent    = knownEntry.alt ? 'Alternative: ' + knownEntry.alt : '';
      } else {
        warningEl.style.display = 'none';
      }
    }

    const sizeDetailed = formatBytesDetailed(pkg.size || 0);
    if (sbSizeEl) {
      while (sbSizeEl.firstChild) sbSizeEl.removeChild(sbSizeEl.firstChild);
      sbSizeEl.appendChild(document.createTextNode(sizeDetailed.value));
      const unitSpan = document.createElement('span');
      unitSpan.className = 'unit';
      unitSpan.textContent = sizeDetailed.unit;
      sbSizeEl.appendChild(unitSpan);
    }

    const shareVal = stats.totalBytes ? (pkg.size / stats.totalBytes * 100).toFixed(1) : '0';
    if (sbShareVal) {
      while (sbShareVal.firstChild) sbShareVal.removeChild(sbShareVal.firstChild);
      sbShareVal.appendChild(document.createTextNode(shareVal));
      const unitSpan = document.createElement('span');
      unitSpan.className = 'unit';
      unitSpan.textContent = '%';
      sbShareVal.appendChild(unitSpan);
    }
    if (sbFilesVal) sbFilesVal.textContent = String((pkg.files || []).length);

    const sbDeltaWrap = document.getElementById('sb-delta-wrap');
    if (prevStats && sbDeltaWrap) {
      const prevPkg = prevPkgMap.get(pkg.name);
      if (prevPkg !== undefined) {
        sbDeltaWrap.style.display = '';
        const deltaEl = document.getElementById('sb-delta-val');
        if (deltaEl) {
          const delta = (pkg.size || 0) - prevPkg.size;
          deltaEl.textContent = (delta > 0 ? '+' : '') + formatBytes(delta);
          deltaEl.className = 'sb-metric__value ' + (delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : 'delta-same');
        }
      } else {
        sbDeltaWrap.style.display = 'none';
      }
    } else if (sbDeltaWrap) {
      sbDeltaWrap.style.display = 'none';
    }

    if (sbFileList) {
      sbFileList.innerHTML = '';
      const topFiles = [...(pkg.files || [])].sort((a, b) => b.size - a.size).slice(0, 20);
      const maxSize = topFiles[0] ? topFiles[0].size : 1;
      for (const f of topFiles) {
        const li = document.createElement('li');
        li.className = 'file-bar';
        li.style.setProperty('--bar', (f.size / maxSize * 100).toFixed(1) + '%');

        const parts = (f.path || '').replace(/\\/g, '/').split('/');
        const displayName = parts.length >= 2 ? parts.slice(-2).join('/') : (parts[0] || f.path || '');

        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-bar__name';
        nameSpan.title = f.path || '';
        nameSpan.textContent = displayName;

        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'file-bar__size';
        sizeSpan.textContent = formatBytes(f.size || 0);

        li.appendChild(nameSpan);
        li.appendChild(sizeSpan);
        sbFileList.appendChild(li);
      }
    }
  }

  function showOtherSidebar(packages) {
    const overview = document.getElementById('sb-overview');
    if (overview) overview.style.display = 'none';
    const sidebar = document.getElementById('sidebar');
    const content = document.querySelector('.sidebar-content');
    if (!sidebar || !content) return;
    sidebar.classList.remove('sidebar--empty');
    content.style.display = 'block';

    const sbName = document.getElementById('sb-name');
    const sbBadge = document.getElementById('sb-badge');
    const sbFileList = document.getElementById('sb-file-list');
    if (sbBadge) sbBadge.textContent = 'group';
    if (sbName)  sbName.textContent  = packages.length + ' small packages';

    const totalSize = packages.reduce((s, p) => s + p.size, 0);
    const sizeDetailed = formatBytesDetailed(totalSize);
    const sbSizeEl = document.getElementById('sb-size-val');
    if (sbSizeEl) {
      while (sbSizeEl.firstChild) sbSizeEl.removeChild(sbSizeEl.firstChild);
      sbSizeEl.appendChild(document.createTextNode(sizeDetailed.value));
      const u = document.createElement('span'); u.className = 'unit'; u.textContent = sizeDetailed.unit;
      sbSizeEl.appendChild(u);
    }

    if (sbFileList) {
      sbFileList.innerHTML = '';
      const sorted = [...packages].sort((a, b) => b.size - a.size);
      const maxSz = sorted[0] ? sorted[0].size : 1;
      for (const pkg of sorted) {
        const li = document.createElement('li');
        li.className = 'file-bar';
        li.style.setProperty('--bar', (pkg.size / maxSz * 100).toFixed(1) + '%');
        li.style.cursor = 'pointer';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-bar__name';
        nameSpan.textContent = pkg.name;
        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'file-bar__size';
        sizeSpan.textContent = formatBytes(pkg.size);
        li.appendChild(nameSpan);
        li.appendChild(sizeSpan);
        li.addEventListener('click', () => {
          minSizeBytes = Math.max(0, pkg.size - 1);
          rebuildAndRender();
          const slider = document.getElementById('min-size');
          if (slider) slider.value = String(sliderValueFromBytes(minSizeBytes));
          const sliderLabel = document.getElementById('min-size-value');
          if (sliderLabel) sliderLabel.textContent = formatBytes(minSizeBytes);
          showSidebar(pkg);
        });
        sbFileList.appendChild(li);
      }
    }
  }

  // --- Search ---
  let searchTimer;
  const searchEl = document.getElementById('search');
  const searchClearEl = document.getElementById('search-clear');

  if (searchEl) {
    searchEl.addEventListener('input', function () {
      clearTimeout(searchTimer);
      const value = this.value;
      if (searchClearEl) searchClearEl.style.display = value ? 'block' : 'none';
      searchTimer = setTimeout(() => { render(value); encodeState(); }, 150);
    });
  }

  if (searchClearEl) {
    searchClearEl.addEventListener('click', () => {
      if (searchEl) {
        searchEl.value = '';
        searchEl.dispatchEvent(new Event('input'));
      }
      searchClearEl.style.display = 'none';
    });
  }

  // --- Chip handlers ---
  let renderRaf = null;
  function scheduleRebuild() {
    if (renderRaf) cancelAnimationFrame(renderRaf);
    renderRaf = requestAnimationFrame(() => {
      renderRaf = null;
      rebuildAndRender();
      encodeState();
    });
  }

  document.querySelectorAll('#cat-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const cat = chip.getAttribute('data-cat');
      if (hiddenCategories.has(cat)) {
        hiddenCategories.delete(cat);
        chip.classList.remove('chip--off');
      } else {
        hiddenCategories.add(cat);
        chip.classList.add('chip--off');
      }
      scheduleRebuild();
    });
  });

  // --- Slider handler ---
  const sliderEl = document.getElementById('min-size');
  const sliderLabel = document.getElementById('min-size-value');
  if (sliderEl) {
    sliderEl.value = String(sliderValueFromBytes(minSizeBytes));
    if (sliderLabel) sliderLabel.textContent = formatBytes(minSizeBytes);
    sliderEl.addEventListener('input', function () {
      minSizeBytes = bytesFromSliderValue(parseInt(this.value, 10));
      if (sliderLabel) sliderLabel.textContent = formatBytes(minSizeBytes);
      scheduleRebuild();
    });
  }

  // --- View toggle (flat <-> grouped) ---
  const viewToggleBtn = document.getElementById('view-toggle');
  if (viewToggleBtn) {
    viewToggleBtn.addEventListener('click', () => {
      setViewMode(viewMode === 'flat' ? 'grouped' : 'flat');
    });
  }

  // --- Reset button ---
  const resetBtn = document.getElementById('controls-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      hiddenCategories.clear();
      minSizeBytes = 0;
      document.querySelectorAll('#cat-chips .chip').forEach(c => c.classList.remove('chip--off'));
      if (sliderEl) sliderEl.value = '0';
      if (sliderLabel) sliderLabel.textContent = '0 B';
      scheduleRebuild();
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== searchEl) {
      e.preventDefault();
      if (searchEl) searchEl.focus();
    }
    if (e.key === 'Escape') {
      if (drillPath.length > 0 && document.activeElement !== searchEl) {
        drillToLevel(drillPath.length - 1);
      } else if (document.activeElement === searchEl) {
        searchEl.blur();
        if (searchEl.value) {
          searchEl.value = '';
          searchEl.dispatchEvent(new Event('input'));
        }
      }
    }
  });

  // --- Resize ---
  let resizeTimer;
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        width = container.clientWidth || width;
        height = container.clientHeight || height;
        svg.attr('width', width).attr('height', height);
        render(currentFilter);
      }, 50);
    });
    ro.observe(container);
  }

  // --- Permalink ---
  function encodeState() {
    const parts = [];
    if (viewMode === 'grouped') parts.push('view=grouped');
    if (currentFilter) parts.push('q=' + encodeURIComponent(currentFilter));
    if (drillPath.length > 0) parts.push('drill=' + drillPath.map(encodeURIComponent).join('/'));
    if (minSizeBytes > 0) parts.push('min=' + Math.round(minSizeBytes / 1024));
    if (hiddenCategories.size > 0) {
      parts.push('cat=' + [...hiddenCategories].map(c => '-' + c).join(','));
    }
    history.replaceState(null, '', parts.length ? '#' + parts.join('&') : location.pathname + location.search);
  }

  function restoreState() {
    if (!location.hash) return;
    const params = new URLSearchParams(location.hash.slice(1));
    const view = params.get('view');
    if (view === 'grouped') {
      viewMode = 'grouped';
      const btn = document.getElementById('view-toggle');
      const lbl = document.getElementById('view-toggle-label');
      if (btn) btn.setAttribute('aria-pressed', 'true');
      if (lbl) lbl.textContent = 'Ungroup';
    }
    const q   = params.get('q');
    if (q && searchEl) {
      searchEl.value = q;
      currentFilter = q.toLowerCase();
      if (searchClearEl) searchClearEl.style.display = 'block';
    }
    const drill = params.get('drill');
    const legacyPkg = params.get('pkg');
    if (drill) {
      drillPath = drill.split('/').map(decodeURIComponent);
      updateBreadcrumb();
    } else if (legacyPkg) {
      if (viewMode === 'grouped') {
        const cat = window.MBV_HIERARCHY.categoryOf(legacyPkg);
        drillPath = [cat, legacyPkg];
      } else {
        drillPath = [legacyPkg];
      }
      updateBreadcrumb();
    }
    const min = params.get('min');
    if (min) {
      minSizeBytes = parseInt(min, 10) * 1024;
    }
    const cat = params.get('cat');
    if (cat) {
      cat.split(',').forEach(token => {
        const name = token.startsWith('-') ? token.slice(1) : token;
        if (name) hiddenCategories.add(name);
      });
      document.querySelectorAll('#cat-chips .chip').forEach(chip => {
        if (hiddenCategories.has(chip.getAttribute('data-cat'))) chip.classList.add('chip--off');
      });
    }
  }

  // --- Init ---
  restoreState();
  rebuildAndRender();

})();
