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

  const hierarchyData = { name: 'root', children: [...pkgMap.values()] };

  // Pre-compute lowercase path cache once at init (not per keystroke)
  const pkgFilePathCache = new Map();
  for (const [name, pkg] of pkgMap) {
    pkgFilePathCache.set(name, (pkg.files || []).map(f => (f.path || '').toLowerCase()));
  }

  const root = d3.hierarchy(hierarchyData)
    .sum(d => d.size || 0)
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

  // --- Render function ---
  function render(filterText) {
    currentFilter = filterText.toLowerCase();
    g.selectAll('*').remove();
    svg.select('.treemap-empty-state').remove();

    const filteredChildren = root.children
      ? root.children.filter(c => {
          if (!currentFilter) return true;
          if ((c.data.name || '').toLowerCase().includes(currentFilter)) return true;
          const paths = pkgFilePathCache.get(c.data.name) || [];
          return paths.some(p => p.includes(currentFilter));
        })
      : [];

    if (filteredChildren.length === 0) {
      svg.append('text')
        .attr('class', 'treemap-empty-state')
        .attr('x', '50%')
        .attr('y', '50%')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .text(currentFilter ? 'No packages match "' + currentFilter + '"' : 'No data');
      return;
    }

    const filteredRoot = d3.hierarchy({
      name: 'root',
      children: filteredChildren.map(c => c.data),
    })
      .sum(d => d.size || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    d3.treemap()
      .size([width, height])
      .paddingOuter(3)
      .paddingInner(2)
      .round(true)(filteredRoot);

    const nodes = g.selectAll('.node')
      .data(filteredRoot.leaves())
      .join('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.x0},${d.y0})`);

    nodes.append('rect')
      .attr('width', d => Math.max(0, d.x1 - d.x0))
      .attr('height', d => Math.max(0, d.y1 - d.y0))
      .attr('fill', d => categoryColor(d.data.name))
      .attr('rx', 2);

    // Package name label (top-left)
    nodes.append('text')
      .attr('class', 'node-label')
      .attr('x', 6)
      .attr('y', 15)
      .text(d => {
        const w = d.x1 - d.x0 - 12;
        const name = d.data.name || '';
        if (w < 30) return '';
        const maxChars = Math.floor(w / 6.5);
        if (maxChars < 4) return '';
        return name.length <= maxChars ? name : name.slice(0, maxChars - 1) + '…';
      });

    // Size label (second line, only for larger cells)
    nodes.append('text')
      .attr('class', 'node-size')
      .attr('x', 6)
      .attr('y', 28)
      .text(d => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        if (w < 60 || h < 36) return '';
        return formatBytes(d.value || 0);
      });

    // Hover and click
    nodes
      .on('mousemove', function (event, d) {
        const pct = d.value && stats.totalBytes ? (d.value / stats.totalBytes * 100).toFixed(1) : '0';
        tooltip.innerHTML =
          '<div class="tooltip__name">' + escapeHtml(d.data.name || '') + '</div>' +
          '<div class="tooltip__row"><span>Size</span><span>' + escapeHtml(formatBytes(d.value || 0)) + '</span></div>' +
          '<div class="tooltip__row"><span>Share</span><span>' + escapeHtml(pct) + '%</span></div>' +
          '<div class="tooltip__row"><span>Files</span><span>' + escapeHtml(String((d.data.files || []).length)) + '</span></div>' +
          '<div class="tooltip__bar-track"><div class="tooltip__bar-fill" style="width:' + escapeHtml(pct) + '%"></div></div>';

        tooltip.classList.add('visible');

        if (tooltipRafId) cancelAnimationFrame(tooltipRafId);
        tooltip.style.transform = 'translate(-9999px,-9999px)';
        tooltipRafId = requestAnimationFrame(() => {
          tooltipRafId = null;
          const pad = 14;
          const tw = tooltip.offsetWidth;
          const th = tooltip.offsetHeight;
          let x = event.clientX + pad;
          let y = event.clientY + pad;
          if (x + tw > window.innerWidth - 8)  x = event.clientX - tw - pad;
          if (y + th > window.innerHeight - 8) y = event.clientY - th - pad;
          tooltip.style.transform = 'translate(' + x + 'px,' + y + 'px)';
        });
      })
      .on('mouseleave', function () {
        tooltip.classList.remove('visible');
      });

    nodes.on('click', function (_event, d) {
      if (selectedNode) d3.select(selectedNode).classed('selected', false);
      selectedNode = this;
      d3.select(this).classed('selected', true);
      showSidebar(d.data);
    });
  }

  // --- Sidebar ---
  function showSidebar(pkg) {
    const sidebar     = document.getElementById('sidebar');
    const placeholder = document.querySelector('.sidebar-placeholder');
    const content     = document.querySelector('.sidebar-content');
    if (!sidebar || !placeholder || !content) return;

    sidebar.classList.remove('sidebar--empty');
    placeholder.style.display = 'none';
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
      searchTimer = setTimeout(() => render(value), 150);
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
      if (document.activeElement === searchEl) {
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

  // --- Init ---
  render('');

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
