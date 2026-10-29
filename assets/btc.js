(() => {
  'use strict';

  const KIND_COLOR = {
    liq_high: '#ef4444',
    equal_high: '#ef4444',
    liq_low: '#22c55e',
    equal_low: '#22c55e',
    order_block: '#a78bfa',
    sweep: '#f59e0b',
    note: '#94a3b8',
  };

  const TF_LABEL = { '1d': '日线', '4h': '4h', '1h': '1h' };
  const STORAGE_KEY = 'morning-report:btc:v1';

  const $ = (id) => document.getElementById(id);

  const state = {
    theme: 'system',
    tf: '1d',
    date: '',
    manifest: null,
    report: null,
    candles: {},
    chart: null,
    series: null,
    priceLines: [],
  };

  function showNotice(msg) {
    const el = $('btc-notice');
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function loadTheme() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (['system', 'light', 'dark'].includes(raw.theme)) state.theme = raw.theme;
      if (['1d', '4h', '1h'].includes(raw.tf)) state.tf = raw.tf;
    } catch { /* ignore */ }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: state.theme, tf: state.tf }));
    } catch { /* ignore */ }
  }

  function applyTheme() {
    if (state.theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = state.theme;
    const sel = $('theme-select');
    if (sel) sel.value = state.theme;
    if (state.chart) applyChartColors();
  }

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function isDark() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark') return true;
    if (attr === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function chartOptions() {
    const dark = isDark();
    return {
      layout: {
        background: { color: cssVar('--surface-alt', dark ? '#1d292c' : '#f8faf9') },
        textColor: cssVar('--muted', dark ? '#9cadaa' : '#637178'),
        fontSize: 11,
      },
      grid: {
        vertLines: { color: cssVar('--line', dark ? '#2c3a3d' : '#e2e7e7') },
        horzLines: { color: cssVar('--line', dark ? '#2c3a3d' : '#e2e7e7') },
      },
      rightPriceScale: { borderColor: cssVar('--line', dark ? '#2c3a3d' : '#e2e7e7') },
      timeScale: {
        borderColor: cssVar('--line', dark ? '#2c3a3d' : '#e2e7e7'),
        timeVisible: state.tf !== '1d',
        secondsVisible: false,
      },
      crosshair: { mode: 0 },
    };
  }

  function applyChartColors() {
    if (!state.chart) return;
    state.chart.applyOptions(chartOptions());
  }

  function fmtPrice(n) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function ethRelText(eth) {
    if (!eth || typeof eth !== 'object') return 'ETH 相对强弱：—';
    if (typeof eth.note === 'string' && eth.note.trim()) return eth.note.trim();
    const btc = eth.btc_chg_pct_24h ?? eth.btc_chg_pct;
    const ethC = eth.eth_chg_pct_24h ?? eth.eth_chg_pct;
    const spread = eth.spread_pp;
    const parts = [];
    if (typeof btc === 'number') parts.push(`BTC ${btc >= 0 ? '+' : ''}${btc.toFixed(2)}%`);
    if (typeof ethC === 'number') parts.push(`ETH ${ethC >= 0 ? '+' : ''}${ethC.toFixed(2)}%`);
    if (typeof spread === 'number') parts.push(`差值 ${spread >= 0 ? '+' : ''}${spread.toFixed(2)}pp`);
    return parts.length ? `相对强弱：${parts.join(' · ')}` : 'ETH 相对强弱：—';
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    return res.json();
  }

  function mapCandles(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const bar of raw) {
      const t = Number(bar.open_time);
      const o = Number(bar.open);
      const h = Number(bar.high);
      const l = Number(bar.low);
      const c = Number(bar.close);
      if (![t, o, h, l, c].every(Number.isFinite)) continue;
      out.push({ time: Math.floor(t / 1000), open: o, high: h, low: l, close: c });
    }
    out.sort((a, b) => a.time - b.time);
    return out;
  }

  function clearPriceLines() {
    if (!state.series) {
      state.priceLines = [];
      return;
    }
    for (const line of state.priceLines) {
      try { state.series.removePriceLine(line); } catch { /* ignore */ }
    }
    state.priceLines = [];
  }

  function applyMarkers() {
    clearPriceLines();
    if (!state.series || !state.report) return;
    const markers = Array.isArray(state.report.markers) ? state.report.markers : [];
    for (const m of markers) {
      if (!m || m.tf !== state.tf) continue;
      const kind = typeof m.kind === 'string' ? m.kind : 'note';
      const color = KIND_COLOR[kind] || KIND_COLOR.note;
      const label = (typeof m.label === 'string' && m.label.trim()) ? m.label.trim() : kind;
      const p1 = Number(m.price);
      if (!Number.isFinite(p1)) continue;
      const line1 = state.series.createPriceLine({
        price: p1,
        color,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: label,
      });
      state.priceLines.push(line1);
      const p2 = m.price2 == null ? NaN : Number(m.price2);
      if (Number.isFinite(p2) && p2 !== p1) {
        const line2 = state.series.createPriceLine({
          price: p2,
          color,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: '',
        });
        state.priceLines.push(line2);
      }
    }
  }

  function ensureChart() {
    const el = $('btc-chart');
    if (!el) return;
    if (typeof LightweightCharts === 'undefined') {
      showNotice('图表库加载失败，请检查网络后刷新。');
      return;
    }
    if (state.chart) return;
    state.chart = LightweightCharts.createChart(el, {
      ...chartOptions(),
      width: el.clientWidth,
      height: el.clientHeight || 480,
      autoSize: true,
    });
    state.series = state.chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    window.addEventListener('resize', () => {
      if (!state.chart) return;
      state.chart.applyOptions({ width: el.clientWidth, height: el.clientHeight || 480 });
    });
  }

  async function loadCandles(tf) {
    if (state.candles[tf]) return state.candles[tf];
    const raw = await fetchJson(`./data/btc/klines/BTCUSDT_${tf}.json`);
    const mapped = mapCandles(raw);
    state.candles[tf] = mapped;
    return mapped;
  }

  async function renderChart() {
    ensureChart();
    if (!state.series) return;
    try {
      const data = await loadCandles(state.tf);
      if (!data.length) {
        showNotice(`缺少 ${TF_LABEL[state.tf] || state.tf} K 线数据。`);
        state.series.setData([]);
        clearPriceLines();
        return;
      }
      state.series.setData(data);
      state.chart.applyOptions({
        timeScale: { timeVisible: state.tf !== '1d', secondsVisible: false },
      });
      state.chart.timeScale().fitContent();
      applyMarkers();
    } catch (err) {
      showNotice(`加载 K 线失败：${err.message || err}`);
      state.series.setData([]);
      clearPriceLines();
    }
  }

  function renderReportMeta() {
    const r = state.report;
    if (!r) {
      $('btc-updated').textContent = '—';
      $('btc-price').textContent = '—';
      $('btc-eth-rel').textContent = 'ETH 相对强弱：—';
      $('btc-summary').textContent = '暂无分析报告。';
      $('btc-sections').innerHTML = '';
      $('btc-limitations').hidden = true;
      return;
    }
    $('btc-updated').textContent = typeof r.updated_at === 'string' ? r.updated_at : '—';
    $('btc-updated').dateTime = typeof r.updated_at === 'string' ? r.updated_at : '';
    const sym = typeof r.symbol === 'string' ? r.symbol : 'BTCUSDT';
    $('btc-price').textContent = `${sym} ${fmtPrice(Number(r.price))}`;
    $('btc-eth-rel').textContent = ethRelText(r.eth_rel);

    const sections = Array.isArray(r.sections) ? r.sections : [];
    $('btc-sections').innerHTML = sections.map((s) => {
      const title = (s && typeof s.title === 'string') ? s.title : '';
      const body = (s && typeof s.body === 'string') ? s.body : '';
      return `<article class="btc-section"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></article>`;
    }).join('');

    $('btc-summary').textContent = typeof r.summary === 'string' && r.summary.trim()
      ? r.summary.trim()
      : '（无总结）';

    const lim = Array.isArray(r.limitations) ? r.limitations.filter((x) => typeof x === 'string' && x.trim()) : [];
    const limBox = $('btc-limitations');
    const limList = $('btc-limits-list');
    if (lim.length) {
      limBox.hidden = false;
      limList.innerHTML = lim.map((x) => `<li>${escapeHtml(x)}</li>`).join('');
    } else {
      limBox.hidden = true;
      limList.innerHTML = '';
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function loadReport(date) {
    state.date = date;
    try {
      state.report = await fetchJson(`./data/btc/reports/${date}.json`);
      showNotice('');
    } catch (err) {
      state.report = null;
      showNotice(`加载报告失败（${date}）：${err.message || err}`);
    }
    renderReportMeta();
    await renderChart();
  }

  function setTf(tf) {
    if (!['1d', '4h', '1h'].includes(tf)) return;
    state.tf = tf;
    persist();
    document.querySelectorAll('.tf-control button').forEach((btn) => {
      const on = btn.dataset.tf === tf;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    renderChart();
  }

  function fillDateSelect(dates, selected) {
    const sel = $('btc-date-select');
    sel.innerHTML = '';
    if (!dates.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '暂无报告';
      sel.appendChild(opt);
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    for (const d of dates) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      if (d === selected) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  async function init() {
    loadTheme();
    applyTheme();
    $('theme-select').addEventListener('change', (e) => {
      state.theme = e.target.value;
      persist();
      applyTheme();
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (state.theme === 'system') applyTheme();
    });

    document.querySelectorAll('.tf-control button').forEach((btn) => {
      btn.addEventListener('click', () => setTf(btn.dataset.tf));
      btn.setAttribute('aria-pressed', btn.dataset.tf === state.tf ? 'true' : 'false');
    });

    $('btc-date-select').addEventListener('change', (e) => {
      if (e.target.value) loadReport(e.target.value);
    });

    try {
      const manifest = await fetchJson('./data/btc/manifest.json');
      state.manifest = manifest;
      const dates = Array.isArray(manifest.dates) ? manifest.dates : [];
      const latest = typeof manifest.latest === 'string' && manifest.latest
        ? manifest.latest
        : (dates[0] || '');
      fillDateSelect(dates, latest);
      const meta = $('btc-klines-meta');
      if (manifest.klines_updated_at) {
        meta.textContent = `K 线缓存更新：${manifest.klines_updated_at}`;
      } else {
        meta.textContent = '';
      }
      if (!latest) {
        showNotice('尚无分析报告。请在 /workspace/market-analysis/reports/ 放入 YYYY-MM-DD.json 后重新构建。');
        renderReportMeta();
        ensureChart();
        await renderChart();
        return;
      }
      await loadReport(latest);
    } catch (err) {
      showNotice(`无法读取 manifest：${err.message || err}`);
      fillDateSelect([], '');
      renderReportMeta();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
