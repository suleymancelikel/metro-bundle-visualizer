(function () {
  'use strict';

  const stats = window.__BUNDLE_STATS__;
  if (!stats) return;

  // --- XSS-güvenli escape helper ---
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // --- Veri aggregasyonu ---
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

  const root = d3.hierarchy(hierarchyData)
    .sum(d => d.size || 0)
    .sort((a, b) => (b.value || 0) - (a.value || 0));

  // --- Renk skalası ---
  const COLOR_SCHEME = d3.schemeTableau10;
  function hashName(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  function getColor(node) {
    if (!node.data || !node.data.name) return '#555';
    if (node.data.name === '<app>') return '#3b82f6';
    return COLOR_SCHEME[hashName(node.data.name) % COLOR_SCHEME.length];
  }

  // --- Header bilgileri ---
  const totalSizeEl = document.getElementById('total-size');
  const metaEl = document.getElementById('meta');
  const footerEl = document.getElementById('footer');

  if (totalSizeEl) totalSizeEl.textContent = '· ' + formatBytes(stats.totalBytes) + ' total';
  if (metaEl) metaEl.textContent = 'Platform: ' + stats.platform + ' · ' + stats.modules.length + ' modules';
  if (footerEl) footerEl.textContent = 'Generated ' + new Date(stats.generatedAt).toLocaleString() + ' · Sizes are pre-minification (~20–40% larger than shipped binary)';

  // --- Tooltip ---
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.style.display = 'none';
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

  // --- Render fonksiyonu ---
  function render(filterText) {
    currentFilter = filterText.toLowerCase();
    g.selectAll('*').remove();
    svg.select('.treemap-empty-state').remove();

    const filteredChildren = root.children
      ? root.children.filter(c =>
          !currentFilter || (c.data.name || '').toLowerCase().includes(currentFilter)
        )
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
      .attr('fill', d => getColor(d))
      .attr('rx', 2);

    nodes.append('text')
      .attr('x', 4)
      .attr('y', 14)
      .text(d => {
        const w = d.x1 - d.x0;
        const name = d.data.name || '';
        if (w < 40) return '';
        if (w < 80) return name.split('/').pop() || name;
        return name;
      })
      .attr('font-size', d => Math.min(12, Math.max(9, (d.x1 - d.x0) / 8)));

    nodes.append('text')
      .attr('x', 4)
      .attr('y', 28)
      .text(d => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        if (w <= 80 || h <= 30) return '';
        return formatBytes(d.value || 0);
      })
      .attr('font-size', 10)
      .attr('fill', 'rgba(255,255,255,0.75)');

    // Hover ve click
    nodes
      .on('mousemove', function (event, d) {
        tooltip.style.display = 'block';
        tooltip.style.left = (event.clientX + 14) + 'px';
        tooltip.style.top = (event.clientY - 28) + 'px';
        tooltip.innerHTML =
          '<strong>' + escapeHtml(d.data.name || '') + '</strong>' +
          escapeHtml(formatBytes(d.value || 0)) + ' (' + escapeHtml(pct(d.value || 0, stats.totalBytes)) + ')';
      })
      .on('mouseleave', function () {
        tooltip.style.display = 'none';
      })
      .on('click', function (_event, d) {
        showSidebar(d.data);
      });
  }

  // --- Sidebar ---
  function showSidebar(pkg) {
    const sidebar = document.getElementById('sidebar');
    const placeholder = document.querySelector('.sidebar-placeholder');
    const content = document.querySelector('.sidebar-content');

    if (!sidebar || !placeholder || !content) return;

    sidebar.classList.remove('sidebar--empty');
    placeholder.style.display = 'none';
    content.style.display = 'block';

    const sbName = document.getElementById('sb-name');
    const sbSize = document.getElementById('sb-size');
    const sbShare = document.getElementById('sb-share');
    const sbFiles = document.getElementById('sb-files');
    const sbFileList = document.getElementById('sb-file-list');

    if (sbName) sbName.textContent = pkg.name || '';
    if (sbSize) sbSize.textContent = formatBytes(pkg.size || 0);
    if (sbShare) sbShare.textContent = pct(pkg.size || 0, stats.totalBytes);
    if (sbFiles) sbFiles.textContent = String((pkg.files || []).length);

    if (sbFileList) {
      sbFileList.innerHTML = '';
      const topFiles = [...(pkg.files || [])].sort((a, b) => b.size - a.size).slice(0, 15);
      for (const f of topFiles) {
        const li = document.createElement('li');
        const parts = (f.path || '').replace(/\\/g, '/').split('/');
        const displayName = parts.length >= 2
          ? parts.slice(-2).join('/')
          : parts[parts.length - 1] || f.path || '';
        const nameSpan = document.createElement('span');
        nameSpan.title = f.path || '';
        nameSpan.textContent = displayName;
        const sizeSpan = document.createElement('span');
        sizeSpan.textContent = formatBytes(f.size || 0);
        li.appendChild(nameSpan);
        li.appendChild(sizeSpan);
        sbFileList.appendChild(li);
      }
    }
  }

  // --- Search ---
  const searchEl = document.getElementById('search');
  if (searchEl) {
    searchEl.addEventListener('input', function () {
      render(this.value);
    });
  }

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

  // --- Helper fonksiyonlar ---
  function formatBytes(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
  }

  function pct(part, total) {
    return total > 0 ? (part / total * 100).toFixed(1) + '%' : '0%';
  }
})();
