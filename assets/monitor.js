(() => {
  const DATA_URL = './monitor/latest.json';
  const ASSET_V = '20261029b';
  const REFRESH_MS = 60000;
  const STALE_SEC = 1800;
  const THEME_KEY = 'morning-report-theme';
  const TZ = 'Asia/Shanghai';
  /* Rank cards show ~3 rows via CSS; render more so user can scroll. */
  const RANK_RENDER = 12;

  const $ = (id) => document.getElementById(id);
  let state = { data: null, timer: null, fetchError: false };

  function applyTheme(mode) {
    const root = document.documentElement;
    if (!mode || mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    localStorage.setItem(THEME_KEY, mode || 'system');
    const sel = $('theme-select');
    if (sel) sel.value = mode || 'system';
  }

  /** Prices / small numbers: plain digits, no Chinese units. */
  function fmtPrice(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    const v = Number(n);
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1000) {
      return sign + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (abs >= 1) return sign + abs.toFixed(2);
    if (abs >= 0.01) return sign + abs.toFixed(4);
    if (abs === 0) return '0';
    return sign + abs.toPrecision(3);
  }

  /** Large volumes / caps: K / M / B only — never 万/亿. */
  function fmtVol(n, digits = 2) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    const v = Number(n);
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1e9) return sign + (abs / 1e9).toFixed(digits) + 'B';
    if (abs >= 1e6) return sign + (abs / 1e6).toFixed(digits) + 'M';
    if (abs >= 1e3) return sign + (abs / 1e3).toFixed(abs >= 1e4 ? 1 : digits) + 'K';
    if (abs >= 1) return sign + abs.toFixed(Math.min(digits, 2));
    if (abs === 0) return '0';
    return sign + abs.toPrecision(3);
  }

  function fmtPct(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    const v = Number(n);
    return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
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

  function shortSym(symbol) {
    if (!symbol) return '—';
    return String(symbol).replace(/USDT$/i, '');
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
      let tip = ok ? '正常' : '异常/过旧';
      if (age != null) tip += ` · ${Math.round(age)}s 前`;
      box.appendChild(el('span', { className: `health-chip ${ok ? 'ok' : 'bad'}`, title: tip }, [
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
      /* 主涨跌优先用窗口 change，没有再用 change24h；禁止用过期提示顶替涨跌幅 */
      const chg = item.change != null ? item.change : item.change24h;
      const cardClass = `focus-card${chg == null ? '' : (Number(chg) >= 0 ? ' is-up' : ' is-down')}`;
      const href = binanceUrl(item.symbol);
      const title = href
        ? el('a', { href, target: '_blank', rel: 'noopener noreferrer', text: shortSym(item.symbol) })
        : el('span', { className: 'sym', text: shortSym(item.symbol) });
      let sub = '';
      if (item.change != null && item.change24h != null) sub = `24h ${fmtPct(item.change24h)}`;
      else if (item.change != null) sub = '窗口涨跌';
      else if (item.change24h != null) sub = '24h';
      return el('div', { className: cardClass }, [
        title,
        el('div', { className: 'focus-price', text: fmtPrice(item.price) }),
        el('div', { className: `focus-chg ${pctClass(chg)}`, text: fmtPct(chg) }),
        el('div', { className: 'focus-sub', text: sub }),
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
        ? el('a', { className: 'sym', href, target: '_blank', rel: 'noopener noreferrer', text: shortSym(ev.symbol) })
        : el('span', { className: 'sym', text: shortSym(ev.symbol) });
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
          el('div', { className: 'meta', text: fmtPrice(ev.price) }),
        ]),
      ]);
    }));
  }

  /** 已报警代币排行：上游已取消热搜/成交第一，主列表用 gmgn_alerts */
  function renderGmgnAlerts(data) {
    const g = data?.gmgn || {};
    const meta = $('gmgn-meta');
    if (meta) meta.textContent = (g.chains || []).length ? (g.chains || []).join(' / ') : '—';
    const list = [...(data?.gmgn_alerts || [])].sort((a, b) => {
      const ta = Math.max(Number(a.last_seen) || 0, Number(a.triggered) || 0);
      const tb = Math.max(Number(b.last_seen) || 0, Number(b.triggered) || 0);
      return tb - ta;
    });
    const countEl = $('gmgn-alert-count');
    if (countEl) countEl.textContent = `${list.length} 条`;
    const box = $('gmgn-alert-list');
    if (!box) return;
    if (!list.length) {
      box.replaceChildren(emptyBox('暂无已报警代币'));
      return;
    }
    box.replaceChildren(...list.map((ev, i) => {
      const tok = ev.token || {};
      const href = gmgnUrl(ev.chain || tok.chain, ev.address || tok.address);
      const logo = safeHttp(tok.logo);
      const titleChildren = [
        el('span', { className: 'idx-mini', text: String(i + 1).padStart(2, '0') }),
      ];
      if (ev.chain || tok.chain) {
        titleChildren.push(el('span', { className: 'badge chain', text: ev.chain || tok.chain }));
      }
      if (logo) {
        titleChildren.push(el('img', {
          className: 'token-logo', src: logo, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer',
        }));
      }
      const name = tok.symbol || tok.name || (ev.address || '').slice(0, 8) || '—';
      titleChildren.push(href
        ? el('a', { className: 'sym', href, target: '_blank', rel: 'noopener noreferrer', text: name })
        : el('span', { className: 'sym', text: name }));
      const metaBits = [ev.rule || ''];
      if (tok.holder_count != null) metaBits.push(`持有人 ${fmtVol(tok.holder_count, 1)}`);
      if (tok.smart_degen_count != null) metaBits.push(`Smart ${fmtVol(tok.smart_degen_count, 0)}`);
      return el('div', { className: 'alert-row gmgn-rank-row' }, [
        el('div', { className: 'when', text: fmtTime(ev.triggered || ev.last_seen, true) }),
        el('div', { className: 'main' }, [
          el('div', { className: 'title-line' }, titleChildren),
          el('div', { className: 'meta', text: metaBits.filter(Boolean).join(' · ') }),
        ]),
        el('div', { className: 'alert-side' }, [
          el('div', { text: tok.volume != null ? fmtVol(tok.volume, 1) : '—' }),
          el('div', { className: 'meta', text: tok.market_cap != null ? `市值 ${fmtVol(tok.market_cap, 1)}` : '' }),
        ]),
      ]);
    }));
  }

  function renderRankList(targetId, rows, opts = {}) {
    const box = $(targetId);
    if (!rows.length) {
      box.replaceChildren(emptyBox('暂无'));
      return;
    }
    const slice = rows.slice(0, RANK_RENDER);
    box.replaceChildren(...slice.map((r, i) => {
      const href = binanceUrl(r.symbol);
      const chg = opts.chgKey ? r[opts.chgKey] : r.change;
      const sym = href
        ? el('a', { className: 'sym', href, target: '_blank', rel: 'noopener noreferrer', text: shortSym(r.symbol) })
        : el('span', { className: 'sym', text: shortSym(r.symbol) });
      const label = opts.tag ? el('span', { className: 'tag-mini', text: opts.tag(r, i) }) : null;
      const symWrap = label ? el('span', { style: 'display:flex;align-items:center;min-width:0' }, [sym, label]) : sym;
      return el('div', { className: 'rank-row' }, [
        el('span', { className: 'idx', text: String(i + 1).padStart(2, '0') }),
        symWrap,
        el('span', { className: `chg ${pctClass(chg)}`, text: fmtPct(chg) }),
        el('span', { className: 'vol', text: fmtVol(r.quote24h != null ? r.quote24h : r.price, 1) }),
      ]);
    }));
  }

  function renderRankings(data) {
    const up = data?.rankings?.up || [];
    const down = data?.rankings?.down || [];
    const oiUp = data?.rankings?.oi_up || [];
    const oiDown = data?.rankings?.oi_down || [];
    /* OI 异动：增在前，减在后，带小标签 */
    const oiMerged = [
      ...oiUp.slice(0, 6).map((r) => ({ ...r, _oiTag: '增' })),
      ...oiDown.slice(0, 6).map((r) => ({ ...r, _oiTag: '减' })),
    ];
    renderRankList('rank-oi', oiMerged, {
      chgKey: 'oi_change',
      tag: (r) => r._oiTag,
    });
    renderRankList('rank-up', up, { chgKey: 'change' });
    renderRankList('rank-down', down, { chgKey: 'change' });
  }

  function pickLatestDay(days) {
    if (!days?.length) return null;
    /* Prefer last entry (usually newest / today). */
    return days[days.length - 1];
  }

  function renderVolume(data) {
    const mv = data?.market_volume || {};
    const days = mv.days || [];
    const day = pickLatestDay(days);
    const box = $('volume-box');
    if (!day) {
      $('volume-meta').textContent = '—';
      box.replaceChildren(emptyBox('暂无成交额数据'));
      return;
    }
    $('volume-meta').textContent = [
      day.date || '',
      mv.symbol_count != null ? `${mv.symbol_count} 标的` : '',
      days.length > 1 ? `${days.length} 日样本` : '',
    ].filter(Boolean).join(' · ');

    const top10 = (day.top10 || []).slice(0, 10);
    const maxQ = Math.max(...top10.map((t) => Number(t.quote) || 0), 1);

    const totalBlock = el('div', { className: 'volume-total' }, [
      el('div', {}, [
        el('div', { className: 'label', text: '当日总额' }),
        el('div', { className: 'sub', text: day.top10_quote != null ? `Top10 ${fmtVol(day.top10_quote, 2)}` : '' }),
      ]),
      el('div', { className: 'value', text: fmtVol(day.quote, 2) }),
    ]);

    const bars = el('div', { className: 'volume-top' }, top10.length ? top10.map((t) => {
      const href = binanceUrl(t.symbol);
      const pct = Math.max(4, ((Number(t.quote) || 0) / maxQ) * 100);
      const sym = href
        ? el('a', { className: 'sym', href, target: '_blank', rel: 'noopener noreferrer', text: shortSym(t.symbol) })
        : el('span', { className: 'sym', text: shortSym(t.symbol) });
      return el('div', { className: 'vol-bar-row' }, [
        sym,
        el('div', { className: 'vol-bar-track' }, [
          el('div', { className: 'vol-bar-fill', style: `width:${pct}%` }),
        ]),
        el('span', { className: 'amt', text: fmtVol(t.quote, 2) }),
      ]);
    }) : [emptyBox('暂无 Top10')]);

    /* Top10 above, total below — as user asked */
    box.replaceChildren(
      el('div', { className: 'gmgn-subhead', text: '当日 Top10' }),
      bars,
      totalBlock,
    );
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
        $('focus-cards')?.replaceChildren(emptyBox('暂无数据'));
        $('spike-list')?.replaceChildren(emptyBox('暂无数据'));
        $('gmgn-alert-list')?.replaceChildren(emptyBox('暂无数据'));
        $('rank-oi')?.replaceChildren(emptyBox('暂无数据'));
        $('rank-up')?.replaceChildren(emptyBox('暂无数据'));
        $('rank-down')?.replaceChildren(emptyBox('暂无数据'));
        $('volume-box')?.replaceChildren(emptyBox('暂无数据'));
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

  function init() {
    applyTheme(localStorage.getItem(THEME_KEY) || 'system');
    $('theme-select')?.addEventListener('change', (e) => applyTheme(e.target.value));
    $('refresh-btn')?.addEventListener('click', () => load(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') load();
    });
    load(true);
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
