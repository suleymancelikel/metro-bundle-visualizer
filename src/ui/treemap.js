(function () {
  'use strict';

  const stats = window.__BUNDLE_STATS__;
  if (!stats) return;

  // --- XSS-safe escape helper ---
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // --- Data aggregation ---
  const pkgMap = new Map();
  for (const mod of stats.modules) {
    const existing = pkgMap.get(mod.package);
    if (existing) {
      existing.size += mod.size;
      existing.files.push(mod);
    } else {
      pkgMap.set(mod.package, { name: mod.package, size: mod.size, files: [mod] });
    }
  }

  const hierarchyData = {
    name: 'root',
    children: [...pkgMap.values()].map(pkg => ({
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
  };

  // Pre-compute lowercase path cache once at init (not per keystroke)
  const pkgFilePathCache = new Map();
  for (const [name, pkg] of pkgMap) {
    pkgFilePathCache.set(name, (pkg.files || []).map(f => (f.path || '').toLowerCase()));
  }

  const root = d3.hierarchy(hierarchyData)
    .sum(d => (d.children ? 0 : d.size) || 0)
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
          enterFocusMode(pkg.name);
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
  let focusedPkg = null;

  // --- Render function ---
  function render(filterText) {
    currentFilter = filterText.toLowerCase();
    g.selectAll('*').remove();
    svg.select('.treemap-empty-state').remove();

    let dataChildren;
    if (focusedPkg !== null) {
      const pkg = pkgMap.get(focusedPkg);
      dataChildren = pkg ? pkg.files.map(f => ({ name: f.path, size: f.size, _pkg: pkg.name, files: [f] })) : [];
    } else {
      dataChildren = root.children
        ? root.children.filter(c => {
            if (!currentFilter) return true;
            if ((c.data.name || '').toLowerCase().includes(currentFilter)) return true;
            const paths = pkgFilePathCache.get(c.data.name) || [];
            return paths.some(p => p.includes(currentFilter));
          }).map(c => c.data)
        : [];
    }

    if (dataChildren.length === 0) {
      svg.append('text')
        .attr('class', 'treemap-empty-state')
        .attr('x', '50%').attr('y', '50%')
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .text(currentFilter ? 'No packages match "' + currentFilter + '"' : 'No data');
      return;
    }

    const filteredRoot = d3.hierarchy({ name: 'root', children: dataChildren })
      .sum(d => (d.children ? 0 : d.size) || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    const PKG_HEADER_H = focusedPkg ? 0 : 18;

    d3.treemap()
      .size([width, height])
      .paddingOuter(3)
      .paddingTop(d => d.depth === 1 && !focusedPkg ? PKG_HEADER_H : 0)
      .paddingInner(1)
      .round(true)(filteredRoot);

    if (!focusedPkg) {
      const pkgGroups = g.selectAll('.pkg-strip')
        .data(filteredRoot.children || [])
        .join('g')
        .attr('class', 'pkg-strip')
        .attr('transform', d => `translate(${d.x0},${d.y0})`);

      pkgGroups.append('rect')
        .attr('width', d => Math.max(0, d.x1 - d.x0))
        .attr('height', PKG_HEADER_H);

      pkgGroups.append('text')
        .attr('x', 4).attr('y', PKG_HEADER_H - 4)
        .text(d => {
          const w = d.x1 - d.x0 - 8;
          const name = d.data.name || '';
          const maxChars = Math.floor(w / 6.5);
          if (maxChars < 3) return '';
          return name.length <= maxChars ? name : name.slice(0, maxChars - 1) + '…';
        });

      pkgGroups.on('click', function (_e, d) {
        enterFocusMode(d.data.name);
      });
    }

    const nodes = g.selectAll('.node')
      .data(filteredRoot.leaves())
      .join('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.x0},${d.y0})`);

    nodes.append('rect')
      .attr('width', d => Math.max(0, d.x1 - d.x0))
      .attr('height', d => Math.max(0, d.y1 - d.y0))
      .attr('fill', d => categoryColor(d.data._pkg || d.data.name))
      .attr('rx', 2);

    nodes.append('text')
      .attr('class', 'node-label')
      .attr('x', 6).attr('y', 15)
      .text(d => {
        const w = d.x1 - d.x0 - 12;
        const name = focusedPkg
          ? ((d.data.name || '').split('/').slice(-2).join('/'))
          : (d.data.name || '');
        if (w < 30) return '';
        const maxChars = Math.floor(w / 6.5);
        if (maxChars < 4) return '';
        return name.length <= maxChars ? name : name.slice(0, maxChars - 1) + '…';
      });

    nodes.append('text')
      .attr('class', 'node-size')
      .attr('x', 6).attr('y', 28)
      .text(d => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        if (w < 60 || h < 36) return '';
        return formatBytes(d.value || 0);
      });

    if (currentFilter && !focusedPkg) {
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
          '<div class="tooltip__name">' + escapeHtml(focusedPkg ? (d.data.name || '').split('/').slice(-1)[0] : pkgName) + '</div>' +
          '<div class="tooltip__row"><span>Size</span><span>' + escapeHtml(formatBytes(d.value || 0)) + '</span></div>' +
          '<div class="tooltip__row"><span>Share</span><span>' + escapeHtml(pct) + '%</span></div>' +
          (focusedPkg ? '' : '<div class="tooltip__row"><span>Files</span><span>' + escapeHtml(String((pkgMap.get(pkgName) || { files: [] }).files.length)) + '</span></div>') +
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
        if (selectedNode) d3.select(selectedNode).classed('selected', false);
        selectedNode = this;
        d3.select(this).classed('selected', true);
        const pkgName = d.data._pkg || d.data.name;
        const pkg = pkgMap.get(pkgName) || { name: pkgName, size: d.value, files: d.data.files || [] };
        showSidebar(pkg);
      });

    const countEl = document.getElementById('search-count');
    if (countEl) {
      if (currentFilter && !focusedPkg) {
        const total = root.children ? root.children.length : 0;
        countEl.textContent = dataChildren.length + ' / ' + total;
      } else {
        countEl.textContent = '';
      }
    }
  }

  function enterFocusMode(pkgName) {
    focusedPkg = pkgName;
    const breadcrumb    = document.getElementById('breadcrumb');
    const breadcrumbPkg = document.getElementById('breadcrumb-pkg');
    if (breadcrumb)    breadcrumb.style.display = 'flex';
    if (breadcrumbPkg) breadcrumbPkg.textContent = pkgName;
    render(currentFilter);
    encodeState();
  }

  function exitFocusMode() {
    focusedPkg = null;
    selectedNode = null;
    const breadcrumb = document.getElementById('breadcrumb');
    if (breadcrumb) breadcrumb.style.display = 'none';
    render(currentFilter);
    encodeState();
  }

  const breadcrumbBack = document.getElementById('breadcrumb-back');
  if (breadcrumbBack) breadcrumbBack.addEventListener('click', exitFocusMode);

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

  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== searchEl) {
      e.preventDefault();
      if (searchEl) searchEl.focus();
    }
    if (e.key === 'Escape') {
      if (focusedPkg !== null) {
        exitFocusMode();
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
    if (currentFilter) parts.push('q=' + encodeURIComponent(currentFilter));
    if (focusedPkg)    parts.push('pkg=' + encodeURIComponent(focusedPkg));
    history.replaceState(null, '', parts.length ? '#' + parts.join('&') : location.pathname + location.search);
  }

  function restoreState() {
    if (!location.hash) return;
    const params = new URLSearchParams(location.hash.slice(1));
    const q   = params.get('q');
    const pkg = params.get('pkg');
    if (q && searchEl) {
      searchEl.value = q;
      currentFilter = q.toLowerCase();
      if (searchClearEl) searchClearEl.style.display = 'block';
    }
    if (pkg) {
      focusedPkg = pkg;
      const breadcrumb    = document.getElementById('breadcrumb');
      const breadcrumbPkg = document.getElementById('breadcrumb-pkg');
      if (breadcrumb)    breadcrumb.style.display = 'flex';
      if (breadcrumbPkg) breadcrumbPkg.textContent = pkg;
    }
  }

  // --- Init ---
  restoreState();
  render(currentFilter);

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

})();
