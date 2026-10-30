(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'morning-report:desk:v1';
  const DATA = 'data/desk';

  const dash = (v) => {
    if (v === null || v === undefined || v === '') return '—';
    return String(v);
  };

  const esc = (value) => {
    const s = value === null || value === undefined ? '' : String(value);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const pct = (value, digits = 2) => {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    const n = Number(value);
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(digits)}%`;
  };

  const pctClass = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return '';
    return n > 0 ? 'up' : 'down';
  };

  const fmtNum = (value, digits = 2) => {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: digits });
  };

  const zoneText = (zoneOrLevel) => {
    if (Array.isArray(zoneOrLevel) && zoneOrLevel.length >= 2) {
      return `${fmtNum(zoneOrLevel[0])} – ${fmtNum(zoneOrLevel[1])}`;
    }
    if (zoneOrLevel !== null && zoneOrLevel !== undefined && zoneOrLevel !== '') {
      return fmtNum(zoneOrLevel);
    }
    return '—';
  };

  const empty = (msg = '暂无数据') => `<div class="empty-block">${esc(msg)}</div>`;

  const fetchJson = async (name) => {
    const res = await fetch(`${DATA}/${name}.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${name} HTTP ${res.status}`);
    return res.json();
  };

  const softFetch = async (name) => {
    try {
      return await fetchJson(name);
    } catch {
      return null;
    }
  };

  /* Theme */
  let theme = 'dark';
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (['system', 'light', 'dark'].includes(saved.theme)) theme = saved.theme;
  } catch { /* ignore */ }
  const applyTheme = () => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = theme;
    const sel = $('theme-select');
    if (sel) sel.value = theme;
  };
  applyTheme();
  $('theme-select')?.addEventListener('change', (event) => {
    theme = event.target.value;
    applyTheme();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme })); } catch { /* ignore */ }
  });

  const renderOverview = (manifest, watchlist, trigger) => {
    const counts = (manifest && manifest.watchlist_counts) || (watchlist && watchlist.counts) || {};
    const bias = (manifest && manifest.bias) || '—';
    const asof = (manifest && manifest.asof) || (watchlist && watchlist.fetched_at_shanghai) || '—';
    $('desk-asof').textContent = asof || '—';
    $('overview-meta').textContent = watchlist?.fetched_at_shanghai
      ? `名单 ${watchlist.fetched_at_shanghai}`
      : 'watchlist';

    const pending = !!(manifest && manifest.trigger_pending);
    const badge = $('trigger-badge');
    const dot = $('status-dot');
    if (pending) {
      badge.hidden = false;
      badge.textContent = `异动待处理 · ${dash(trigger?.notify_status)}`;
      dot?.classList.add('bad');
    } else {
      badge.hidden = true;
      dot?.classList.remove('bad');
    }

    const cards = [
      { label: '数据截至', value: asof || '—', unit: '', warn: false },
      { label: '市场偏见', value: bias || '—', unit: '', warn: /risk_off|bear/i.test(String(bias)) },
      { label: 'Watchlist', value: dash(counts.watchlist), unit: `C${dash(counts.crypto)} · T${dash(counts.tradifi)} · HK${dash(counts.hk_equity)} · A${dash(counts.cn_equity)}`, warn: false },
      {
        label: '异动 Trigger',
        value: trigger ? (trigger.triggered ? '已触发' : '未触发') : '—',
        unit: trigger ? `状态 ${dash(trigger.notify_status)}` : '暂无',
        warn: pending || !!(trigger && trigger.triggered),
      },
    ];

    $('overview-cards').innerHTML = cards.map((c) => `
      <article class="kpi${c.warn ? ' warn' : ''}">
        <div class="kpi-label">${esc(c.label)}</div>
        <div class="kpi-value">${esc(c.value)}${c.unit ? `<span class="kpi-unit">${esc(c.unit)}</span>` : ''}</div>
      </article>
    `).join('');
  };

  const renderOpp = (opp) => {
    const root = $('opp-panel');
    if (!opp) {
      root.innerHTML = empty('暂无机会报告（opp_latest）');
      return;
    }
    const btc = opp.btc || {};
    const entry = btc.entry || {};
    const levels = Array.isArray(entry.levels) ? entry.levels : [];
    const levelHtml = levels.length
      ? `<ul class="level-list">${levels.map((lv) => `
          <li>
            <div class="item-top"><span class="sym">${esc(lv.side || 'level')}</span><span class="muted">${esc(lv.role || '')}</span></div>
            <div>${esc(zoneText(lv.zone || lv.level))}</div>
          </li>`).join('')}</ul>`
      : empty('暂无进场位');

    root.innerHTML = `
      <div class="meta-line">
        <span class="pill ${opp.action === 'observe_only' ? 'neutral' : 'ok'}">${esc(dash(opp.action))}</span>
        <span class="pill neutral">${esc(dash(opp.stance))}</span>
        <span>asof ${esc(dash(opp.asof))}</span>
        <span>偏见 ${esc(dash(opp.market_context?.bias))}</span>
      </div>
      <div class="desk-grid two">
        <article class="desk-card">
          <h3>BTC · ${esc(dash(btc.bias_daily))}</h3>
          <dl class="kv">
            <dt>现价</dt><dd>${esc(fmtNum(btc.price_ref))} <span class="${pctClass(btc.chg_24h_pct)}">${esc(pct(btc.chg_24h_pct))}</span></dd>
            <dt>日区间</dt><dd>${esc(Array.isArray(btc.day_range) ? btc.day_range.map((x) => fmtNum(x)).join(' – ') : '—')}</dd>
            <dt>结构</dt><dd>1d ${esc(dash(btc.structure?.['1d']))} · 4h ${esc(dash(btc.structure?.['4h']))} · 1h ${esc(dash(btc.structure?.['1h']))}</dd>
            <dt>确信</dt><dd>${esc(dash(btc.conviction))}</dd>
            <dt>进场</dt><dd><span class="pill ${entry.status === '未达到' ? 'neutral' : 'ok'}">${esc(dash(entry.status))}</span> ${esc(dash(entry.preferred_side))}</dd>
          </dl>
          <p class="prose clamp" style="margin-top:10px">${esc(dash(btc.view_4h))}</p>
        </article>
        <article class="desk-card">
          <h3>进场位</h3>
          ${levelHtml}
          <p class="muted" style="margin-top:8px">${esc(dash(entry.basis))}</p>
        </article>
      </div>
      <div class="desk-grid three" style="margin-top:12px">
        <article class="desk-card"><h3>美股综合</h3><p class="prose clamp">${esc(dash(opp.us_equity?.view))}</p></article>
        <article class="desk-card"><h3>A股综合</h3><p class="prose clamp">${esc(dash(opp.a_share?.view))}</p></article>
        <article class="desk-card"><h3>港股综合</h3><p class="prose clamp">${esc(dash(opp.hk_equity?.view))}</p></article>
      </div>
      <article class="desk-card" style="margin-top:12px">
        <h3>Desk 摘要</h3>
        <p class="prose">${esc(dash(opp.summary_for_desk))}</p>
        <p class="muted" style="margin-top:8px">推特热点：${esc(dash(opp.twitter_hot))}</p>
      </article>
    `;
  };

  const renderAnomaly = (anomaly, trigger) => {
    const root = $('anomaly-panel');
    const triggerBlock = trigger
      ? `<article class="desk-card${trigger.triggered ? ' ' : ''}">
          <h3>Trigger 旁注</h3>
          <dl class="kv">
            <dt>triggered</dt><dd>${trigger.triggered ? '<span class="pill bad">true</span>' : '<span class="pill ok">false</span>'}</dd>
            <dt>notify</dt><dd>${esc(dash(trigger.notify_status))}</dd>
            <dt>检查</dt><dd>${esc(dash(trigger.last_checked_at))}</dd>
            <dt>触发于</dt><dd>${esc(dash(trigger.triggered_at))}</dd>
            <dt>reasons</dt><dd>${esc((trigger.reasons && trigger.reasons.length) ? trigger.reasons.join('；') : '—')}</dd>
            <dt>symbols</dt><dd>${esc((trigger.symbols && trigger.symbols.length) ? trigger.symbols.join(', ') : '—')}</dd>
          </dl>
        </article>`
      : `<article class="desk-card">${empty('暂无 anomaly_trigger')}</article>`;

    if (!anomaly) {
      root.innerHTML = `<div class="desk-grid two">${empty('暂无异动报告')}${triggerBlock}</div>`;
      return;
    }

    const items = Array.isArray(anomaly.items) ? anomaly.items : [];
    const itemsHtml = items.length
      ? `<ul class="item-list">${items.map((it) => {
          const metrics = it.metrics && typeof it.metrics === 'object' ? Object.entries(it.metrics) : [];
          return `<li>
            <div class="item-top">
              <span class="sym">${esc(dash(it.symbol))} <span class="muted">${esc(dash(it.bucket))}</span></span>
              <span class="sev-${esc(it.severity || 'low')}">${esc(dash(it.severity))}</span>
            </div>
            <p class="prose">${esc(dash(it.read))}</p>
            <div class="metrics">${metrics.slice(0, 8).map(([k, v]) => `<span class="metric-chip">${esc(k)} ${esc(typeof v === 'number' ? (Math.abs(v) < 1 && Math.abs(v) > 0 ? v.toFixed(4) : fmtNum(v)) : v)}</span>`).join('')}</div>
            ${it.news_tie ? `<p class="muted" style="margin-top:6px">新闻：${esc(it.news_tie)}</p>` : ''}
          </li>`;
        }).join('')}</ul>`
      : empty('暂无异动条目');

    const res = anomaly.resonance_verdict || {};
    root.innerHTML = `
      <div class="meta-line">
        <span class="pill ${anomaly.action === 'observe_only' ? 'neutral' : 'ok'}">${esc(dash(anomaly.action))}</span>
        <span>asof ${esc(dash(anomaly.asof))}</span>
        <span>偏见 ${esc(dash(anomaly.market_bias))}</span>
        <span>触发源 ${esc(dash(anomaly.trigger))}</span>
      </div>
      <div class="desk-grid two">
        <article class="desk-card">
          <h3>摘要</h3>
          <p class="prose">${esc(dash(anomaly.summary))}</p>
          <dl class="kv" style="margin-top:10px">
            <dt>TradFi</dt><dd>${esc(dash(res.tradifi_vs_news))}</dd>
            <dt>加密</dt><dd>${esc(dash(res.crypto_vs_news))}</dd>
            <dt>下一步</dt><dd>${esc((res.watch_next && res.watch_next.length) ? res.watch_next.join('；') : '—')}</dd>
          </dl>
        </article>
        ${triggerBlock}
      </div>
      <div style="margin-top:12px">${itemsHtml}</div>
    `;
  };

  const BUCKET_LABEL = {
    crypto: '加密',
    tradifi: 'TradFi',
    hk_equity: '港股',
    cn_equity: 'A股',
  };

  const moverRows = (rows, valueKey) => {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return '<p class="muted">—</p>';
    return `<table class="mover-table"><thead><tr><th>标的</th><th class="num">涨跌</th></tr></thead><tbody>
      ${list.map((r) => {
        const val = r[valueKey] ?? r.change_4h ?? r.roi_15m ?? r.priceChangePercent;
        const show = valueKey === 'roi_15m' ? pct(Number(val) * (Math.abs(Number(val)) <= 2 ? 100 : 1)) : pct(val);
        // roi_15m in source is fraction (0.46 = 46%); normalize
        let display = show;
        let cls = pctClass(val);
        if (valueKey === 'roi_15m' && Number.isFinite(Number(val))) {
          const n = Math.abs(Number(val)) <= 2 ? Number(val) * 100 : Number(val);
          display = pct(n);
          cls = pctClass(n);
        }
        return `<tr><td>${esc(r.symbol || '—')}</td><td class="num ${cls}">${esc(display)}</td></tr>`;
      }).join('')}
    </tbody></table>`;
  };

  const renderMovers = (movers) => {
    const root = $('movers-panel');
    if (!movers || !movers.by_bucket) {
      root.innerHTML = empty('暂无行情 / movers');
      return;
    }
    const buckets = Object.keys(movers.by_bucket);
    if (!buckets.length) {
      root.innerHTML = empty('暂无 by_bucket');
      return;
    }
    root.innerHTML = `
      <p class="muted" style="margin-bottom:10px">更新 ${esc(dash(movers.updated_at_shanghai))} · ${esc(dash(movers.universe))}</p>
      ${buckets.map((key) => {
        const board = movers.by_bucket[key] || {};
        return `<div class="bucket-block">
          <div class="bucket-title"><span>${esc(BUCKET_LABEL[key] || key)}</span><span class="muted">${esc(key)}</span></div>
          <div class="mover-cols">
            <div class="mover-col"><h4>4h 涨幅</h4>${moverRows(board.gainers_4h, 'change_4h')}</div>
            <div class="mover-col"><h4>4h 跌幅</h4>${moverRows(board.losers_4h, 'change_4h')}</div>
            <div class="mover-col"><h4>15m 异动</h4>${moverRows(board.surge_15m, 'roi_15m')}</div>
          </div>
        </div>`;
      }).join('')}
    `;
  };

  const renderNews = (news) => {
    const root = $('news-panel');
    if (!news || !Array.isArray(news.items) || !news.items.length) {
      root.innerHTML = empty('暂无新闻池数据');
      return;
    }
    root.innerHTML = `
      <p class="muted" style="margin-bottom:10px">更新 ${esc(dash(news.updated_at))} · ${esc(news.count || news.items.length)} 条</p>
      <ul class="news-list">
        ${news.items.map((n) => {
          const title = dash(n.title);
          const link = n.url
            ? `<a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a>`
            : esc(title);
          return `<li>
            <div class="news-top">${link}<span class="muted">${esc(dash(n.source_id))}</span></div>
            <p class="prose clamp">${esc(dash(n.summary))}</p>
            <p class="muted" style="margin-top:4px">${esc(dash(n.published_at))}</p>
          </li>`;
        }).join('')}
      </ul>
    `;
  };

  const renderHandoff = (handoff) => {
    const root = $('handoff-panel');
    if (!handoff || !Array.isArray(handoff.items) || !handoff.items.length) {
      root.innerHTML = empty('暂无结构摘要（BTC/ETH）');
      return;
    }
    root.innerHTML = `
      <p class="muted" style="margin-bottom:10px">更新 ${esc(dash(handoff.updated_at))}</p>
      <div class="desk-grid two">
        ${handoff.items.map((it) => {
          const zones = Array.isArray(it.focus_zones) ? it.focus_zones : [];
          return `<article class="desk-card">
            <h3>${esc(dash(it.symbol))} <span class="muted">${esc(dash(it.bucket))}</span></h3>
            <dl class="kv">
              <dt>现价</dt><dd>${esc(fmtNum(it.price))}</dd>
              <dt>日区间</dt><dd>${esc(Array.isArray(it.day_range) ? it.day_range.map((x) => fmtNum(x)).join(' – ') : '—')}</dd>
              <dt>结构</dt><dd>1d ${esc(dash(it.structure?.['1d']))} · 4h ${esc(dash(it.structure?.['4h']))} · 1h ${esc(dash(it.structure?.['1h']))}</dd>
              <dt>RSI</dt><dd>1d ${esc(fmtNum(it.rsi?.['1d']))} · 4h ${esc(fmtNum(it.rsi?.['4h']))} · 1h ${esc(fmtNum(it.rsi?.['1h']))}</dd>
            </dl>
            <p class="prose" style="margin-top:8px">${esc(dash(it.summary))}</p>
            <div class="zones">${zones.map((z) => {
              const side = z.side || '';
              const label = z.zone ? zoneText(z.zone) : zoneText(z.level);
              return `<span class="zone-chip ${esc(side)}">${esc(side || z.kind || 'zone')} ${esc(label)}</span>`;
            }).join('')}</div>
          </article>`;
        }).join('')}
      </div>
    `;
  };

  const boot = async () => {
    const [manifest, watchlist, opp, anomaly, trigger, movers, news, handoff] = await Promise.all([
      softFetch('manifest'),
      softFetch('watchlist'),
      softFetch('opp'),
      softFetch('anomaly'),
      softFetch('trigger'),
      softFetch('movers'),
      softFetch('news'),
      softFetch('handoff'),
    ]);

    renderOverview(manifest, watchlist, trigger);
    renderOpp(opp);
    renderAnomaly(anomaly, trigger);
    renderMovers(movers);
    renderNews(news);
    renderHandoff(handoff);
  };

  boot().catch((err) => {
    console.error(err);
    $('overview-cards').innerHTML = empty('看板加载失败');
  });
})();
