(() => {
  const DATA_URL = './monitor/latest.json';
  const REFRESH_MS = 60000;
  const STALE_SEC = 1800;
  const THEME_KEY = 'morning-report-theme';
  const TZ = 'Asia/Shanghai';

  const $ = (id) => document.getElementById(id);
  let state = { data: null, rank: 'up', timer: null, fetchError: false };

  function applyTheme(mode) {
    const root = document.documentElement;
    if (!mode || mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    localStorage.setItem(THEME_KEY, mode || 'system');
    const sel = $('theme-select');
    if (sel) sel.value = mode || 'system';
  }

  function fmtNum(n, digits = 2) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    const v = Number(n);
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + '亿';
    if (abs >= 1e4) return sign + (abs / 1e4).toFixed(abs >= 1e6 ? 1 : 2) + '万';
    if (abs >= 1000) return sign + abs.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
    if (abs >= 1) return sign + abs.toFixed(digits);
    if (abs >= 0.01) return sign + abs.toFixed(4);
    return sign + abs.toPrecision(3);
  }

  function fmtPct(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    const v = Number(n);
    const s = (v > 0 ? '+' : '') + v.toFixed(2) + '%';
    return s;
  }

  function pctClass(n) {
    if (n == null || Number.isNaN(Number(n))) return '';
    return Number(n) >= 0 ? 'up' : 'down';
  }

  function toDate(ts) {
    if (ts == null) return null;
    let n = Number(ts);
    if (Number.isNaN(n)) return null;
    if (n > 1e12) n /= 1000;
    return new Date(n * 1000);
  }

  function fmtTime(ts, withDate = false) {
    const d = toDate(ts);
    if (!d) return '—';
    return d.toLocaleString('zh-CN', {
      timeZone: TZ,
      month: withDate ? 'numeric' : undefined,
      day: withDate ? 'numeric' : undefined,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  function fmtIso(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('zh-CN', {
      timeZone: TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  }

  function safeHttp(url) {
    if (!url || typeof url !== 'string') return null;
    try {
      const u = new URL(url, location.href);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    } catch (_) {}
    return null;
  }

  function binanceUrl(symbol) {
    if (!symbol) return null;
    return `https://www.binance.com/zh-CN/futures/${encodeURIComponent(symbol)}`;
  }

  function gmgnUrl(chain, address) {
    if (!chain || !address) return null;
    return `https://gmgn.ai/${encodeURIComponent(chain)}/token/${encodeURIComponent(address)}`;
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'className') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of [].concat(children)) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function emptyBox(text) {
    return el('div', { className: 'empty', text });
  }

  function renderHealth(data) {
    const box = $('health-strip');
    box.replaceChildren();
    const h = data?.health || {};
    const items = [
      ['币安', h.binance],
      ['GMGN', h.gmgn],
      ['成交额', h.volume],
    ];
    for (const [label, info] of items) {
      const ok = !!(info && info.ok);
      const age = info?.age_seconds;
      let cls = ok ? 'ok' : 'bad';
      let tip = ok ? '正常' : '异常/过旧';
      if (age != null) tip += ` · ${Math.round(age)}s 前`;
      box.appendChild(el('span', { className: `health-chip ${cls}`, title: tip }, [
        el('span', { className: 'dot', 'aria-hidden': 'true' }),
        `${label}${ok ? '' : ' ⚠'}`,
      ]));
    }
  }

  function renderStale(data) {
    const banner = $('stale-banner');
    const age = data?.age_seconds;
    const stale = !!(data?.stale || (age != null && age > STALE_SEC));
    if (!stale) {
      banner.hidden = true;
      banner.textContent = '';
      $('live-dot')?.classList.remove('bad');
      return;
    }
    banner.hidden = false;
    banner.textContent = data?.stale_hint || '采集端可能已离线';
    if (age != null) banner.textContent += `（约 ${Math.round(age / 60)} 分钟未更新）`;
    $('live-dot')?.classList.add('bad');
  }

  function renderFocus(data) {
    const box = $('focus-cards');
    const list = data?.focus || [];
    $('focus-meta').textContent = list.length ? `${list.length} 个标的` : '暂无';
    if (!list.length) {
      box.replaceChildren(emptyBox('暂无数据'));
      return;
    }
    box.replaceChildren(...list.map((item) => {
      const chg = item.change ?? item.change24h;
      const href = binanceUrl(item.symbol);
      const title = href
        ? el('a', { href, target: '_blank', rel: 'noopener noreferrer', text: item.symbol || '—' })
        : el('span', { text: item.symbol || '—' });
      return el('div', { className: 'focus-card' }, [
        title,
        el('div', { className: 'focus-price', text: fmtNum(item.price) }),
        el('div', { className: `focus-chg ${pctClass(chg)}`, text: fmtPct(chg) }),
        el('div', { className: 'focus-sub', text: item.change24h != null ? `24h ${fmtPct(item.change24h)}` : (item.fresh === false ? '价格采样偏旧' : '窗口涨跌') }),
      ]);
    }));
  }

  function renderSpikes(data) {
    const list = [...(data?.spike_alerts || [])].sort((a, b) => (b.time || 0) - (a.time || 0));
    $('spike-count').textContent = `${list.length} 条`;
    const box = $('spike-list');
    if (!list.length) {
      box.replaceChildren(emptyBox('暂无急涨急跌警报'));
      return;
    }
    box.replaceChildren(...list.map((ev) => {
      const up = String(ev.direction || '').includes('涨');
      const href = binanceUrl(ev.symbol);
      const sym = href
        ? el('a', { className: 'sym', href, target: '_blank', rel: 'noopener noreferrer', text: ev.symbol || '—' })
        : el('span', { className: 'sym', text: ev.symbol || '—' });
      return el('div', { className: 'alert-row' }, [
        el('div', { className: 'when', text: fmtTime(ev.time) }),
        el('div', { className: 'main' }, [
          el('div', {}, [
            el('span', { className: `badge ${up ? 'up' : 'down'}`, text: ev.direction || '变动' }),
            sym,
          ]),
          el('div', { className: 'meta', text: ev.basis || '' }),
        ]),
        el('div', { className: `alert-side ${pctClass(ev.change)}` }, [
          el('div', { text: fmtPct(ev.change) }),
          el('div', { className: 'meta', style: 'font-weight:500', text: fmtNum(ev.price) }),
        ]),
      ]);
    }));
  }

  function renderGmgnAlerts(data) {
    const list = [...(data?.gmgn_alerts || [])].sort((a, b) => (b.triggered || 0) - (a.triggered || 0));
    $('gmgn-alert-count').textContent = `${list.length} 条`;
    const box = $('gmgn-alert-list');
    if (!list.length) {
      box.replaceChildren(emptyBox('暂无 GMGN 警报'));
      return;
    }
    box.replaceChildren(...list.map((ev) => {
      const tok = ev.token || {};
      const href = gmgnUrl(ev.chain || tok.chain, ev.address || tok.address);
      const logo = safeHttp(tok.logo);
      const titleChildren = [];
      if (ev.chain) titleChildren.push(el('span', { className: 'badge chain', text: ev.chain }));
      if (logo) titleChildren.push(el('img', { className: 'token-logo', src: logo, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }));
      const name = tok.symbol || tok.name || (ev.address || '').slice(0, 8) || '—';
      titleChildren.push(href
        ? el('a', { className: 'sym', href, target: '_blank', rel: 'noopener noreferrer', text: name })
        : el('span', { className: 'sym', text: name }));
      return el('div', { className: 'alert-row' }, [
        el('div', { className: 'when', text: fmtTime(ev.triggered, true) }),
        el('div', { className: 'main' }, [
          el('div', {}, titleChildren),
          el('div', { className: 'meta', text: ev.rule || '' }),
        ]),
        el('div', { className: 'alert-side' }, [
          el('div', { text: tok.volume != null ? `量 ${fmtNum(tok.volume, 1)}` : '—' }),
          el('div', { className: 'meta', style: 'font-weight:500', text: tok.market_cap != null ? `市值 ${fmtNum(tok.market_cap, 1)}` : '' }),
        ]),
      ]);
    }));
  }

  function renderRankings(data) {
    const key = state.rank;
    const rows = data?.rankings?.[key] || [];
    const box = $('rank-table');
    if (!rows.length) {
      box.replaceChildren(emptyBox('暂无排行数据'));
      return;
    }
    const table = el('table');
    const thead = el('thead', {}, [
      el('tr', {}, ['#', '合约', '价格', '窗口%', '24h%', 'OI%', '成交额24h'].map((t) => el('th', { text: t }))),
    ]);
    const tbody = el('tbody');
    rows.forEach((r, i) => {
      const href = binanceUrl(r.symbol);
      const sym = href
        ? el('a', { href, target: '_blank', rel: 'noopener noreferrer', text: r.symbol || '—' })
        : el('span', { text: r.symbol || '—' });
      tbody.appendChild(el('tr', {}, [
        el('td', { text: String(i + 1).padStart(2, '0') }),
        el('td', {}, [sym]),
        el('td', { text: fmtNum(r.price) }),
        el('td', { className: pctClass(r.change), text: fmtPct(r.change) }),
        el('td', { className: pctClass(r.change24h), text: fmtPct(r.change24h) }),
        el('td', { className: pctClass(r.oi_change), text: fmtPct(r.oi_change) }),
        el('td', { text: fmtNum(r.quote24h, 1) }),
      ]));
    });
    table.append(thead, tbody);
    box.replaceChildren(table);
  }

  function tokenCard(tok, featuredLabel) {
    if (!tok) return null;
    const href = gmgnUrl(tok.chain, tok.address);
    const logo = safeHttp(tok.logo);
    const title = [];
    if (tok.chain) title.push(el('span', { className: 'badge chain', text: tok.chain }));
    if (logo) title.push(el('img', { className: 'token-logo', src: logo, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }));
    const name = tok.symbol || tok.name || '—';
    title.push(href
      ? el('a', { href, target: '_blank', rel: 'noopener noreferrer', text: name })
      : el('span', { text: name }));
    if (featuredLabel) title.push(el('span', { className: 'badge', text: featuredLabel, style: 'background:var(--hot-bg);color:var(--hot-text)' }));
    return el('div', { className: `gmgn-card${featuredLabel ? ' featured' : ''}` }, [
      el('div', { className: 'title' }, title),
      el('div', { className: 'stats' }, [
        el('div', {}, [el('strong', { text: fmtNum(tok.volume, 1) }), '成交额']),
        el('div', {}, [el('strong', { text: fmtNum(tok.market_cap, 1) }), '市值']),
        el('div', {}, [el('strong', { text: fmtNum(tok.smart_degen_count, 0) }), 'Smart']),
        el('div', {}, [el('strong', { text: fmtNum(tok.renowned_count, 0) }), 'KOL']),
      ]),
    ]);
  }

  function renderGmgn(data) {
    const g = data?.gmgn || {};
    const box = $('gmgn-leaders');
    $('gmgn-meta').textContent = (g.chains || []).length ? `链：${(g.chains || []).join(' / ')}` : '—';
    const cards = [];
    const hot = tokenCard(g.hot, '热门');
    const vol = tokenCard(g.volume_leader, '放量');
    if (hot) cards.push(hot);
    if (vol && g.volume_leader?.address !== g.hot?.address) cards.push(vol);
    for (const t of g.hot_leaders || []) {
      if (t?.address && t.address !== g.hot?.address && t.address !== g.volume_leader?.address) {
        const c = tokenCard(t);
        if (c) cards.push(c);
      }
    }
    box.replaceChildren(...(cards.length ? cards : [emptyBox('暂无 GMGN 热度')]));
  }

  function renderVolume(data) {
    const days = data?.market_volume?.days || [];
    $('volume-meta').textContent = days.length
      ? `${days.length} 天 · ${data.market_volume.symbol_count || '—'} 标的`
      : '—';
    const box = $('volume-days');
    if (!days.length) {
      box.replaceChildren(emptyBox('暂无成交额数据'));
      return;
    }
    const maxQ = Math.max(...days.map((d) => Number(d.quote) || 0), 1);
    box.replaceChildren(...[...days].reverse().map((d) => {
      const chips = (d.top10 || []).slice(0, 10).map((t) => {
        const href = binanceUrl(t.symbol);
        const label = `${t.symbol?.replace(/USDT$/, '') || '?'} ${fmtNum(t.quote, 1)}`;
        return href
          ? el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, [el('span', {}, [label])])
          : el('span', { text: label });
      });
      const bar = el('div', {
        style: `height:4px;border-radius:2px;background:var(--accent);opacity:.55;width:${Math.max(4, (Number(d.quote) / maxQ) * 100)}%;margin-bottom:8px`,
      });
      return el('div', { className: 'volume-day' }, [
        el('div', { className: 'vd-head' }, [
          el('span', { text: d.date || '—' }),
          el('strong', { text: fmtNum(d.quote, 1) }),
        ]),
        bar,
        el('div', { className: 'volume-chips' }, chips),
      ]);
    }));
  }

  function renderAll(data) {
    state.data = data;
    $('last-updated').textContent = fmtIso(data?.generated_at_iso) || fmtTime(data?.generated_at, true);
    renderHealth(data);
    renderStale(data);
    renderFocus(data);
    renderSpikes(data);
    renderGmgnAlerts(data);
    renderRankings(data);
    renderGmgn(data);
    renderVolume(data);
    const note = $('refresh-note');
    if (state.fetchError) {
      note.hidden = false;
      note.textContent = '刷新失败，仍显示缓存';
    } else {
      note.hidden = true;
      note.textContent = '';
    }
  }

  async function load(isManual = false) {
    try {
      const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data || typeof data !== 'object') throw new Error('bad json');
      state.fetchError = false;
      renderAll(data);
    } catch (err) {
      state.fetchError = true;
      if (state.data) {
        renderAll(state.data);
      } else {
        $('last-updated').textContent = '—';
        $('focus-cards').replaceChildren(emptyBox('暂无数据'));
        $('spike-list').replaceChildren(emptyBox('暂无数据'));
        $('gmgn-alert-list').replaceChildren(emptyBox('暂无数据'));
        $('rank-table').replaceChildren(emptyBox('暂无数据'));
        $('gmgn-leaders').replaceChildren(emptyBox('暂无数据'));
        $('volume-days').replaceChildren(emptyBox('暂无数据'));
        const note = $('refresh-note');
        note.hidden = false;
        note.textContent = isManual ? '加载失败' : '暂无数据或加载失败';
      }
      console.warn('monitor load failed', err);
    }
  }

  function schedule() {
    clearInterval(state.timer);
    state.timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
  }

  function initRankTabs() {
    const tabs = $('rank-tabs');
    tabs?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-rank]');
      if (!btn) return;
      state.rank = btn.dataset.rank;
      tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
      if (state.data) renderRankings(state.data);
    });
  }

  function init() {
    applyTheme(localStorage.getItem(THEME_KEY) || 'system');
    $('theme-select')?.addEventListener('change', (e) => applyTheme(e.target.value));
    $('refresh-btn')?.addEventListener('click', () => load(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') load();
    });
    initRankTabs();
    load(true);
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
