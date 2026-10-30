(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'morning-report:desk:v1';
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


  const words = {
    risk_off_tradifi_led: '美股（传统金融永续）主导、风险偏好下降',
    observe_only: '只观察、不下手', plan_only_no_trade: '只做计划、不下单',
    bearish: '偏空', bullish: '偏多', neutral: '观望', short: '偏空回抽', long: '偏多',
    'supply order_block': '供给订单块', 'demand focus': '需求区',
    'focus/order_blocks': '重点订单块', risk_off: '风险偏好下降',
    CN_EQUITY: '中资相关', TradFi: '传统金融', tradifi: '传统金融',
    handoff: '结构分析', movers: '行情', focus: '重点', supply: '供给区', demand: '需求区',
    order_block: '订单块', Binance: '币安', taker: '主动买卖比',
    SOX: '半导体', AI: '人工智能', PCE: '个人消费支出物价指数'
  };
  const clean = value => {
    if (typeof value !== 'string') return '';
    let s = value.replace(/【[^】]*】/g, '').replace(/主名单=[^。]*。/g, '')
      .replace(/stance=/gi, '').replace(/watchlist\d*/gi, '观察名单')
      .replace(/[（(](?:HH\+LL|LH\+HL)[）)]/g, '')
      .replace(/RSI(?:1d|4h|14)?/g, '相对强弱指标').replace(/OI/g, '持仓量');
    for (const [a,b] of Object.entries(words)) s = s.split(a).join(b);
    return s.replace(/\b4h\b/g, '四小时').replace(/\b1h\b/g, '一小时').replace(/\b1d\b/g, '日线')
      .replace(/24h/g, '二十四小时').replace(/15m/g, '十五分钟').replace(/6h/g, '六小时')
      .replace(/\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/g, '待确认')
      .replace(/\[([\d., ]+)\]/g, '$1').replace(/=/g, '为').trim();
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = v => esc(clean(v));
  const para = v => clean(v) ? `<p>${text(v)}</p>` : '';
  const num = n => n !== null && n !== '' && Number.isFinite(Number(n)) ? String(Number(n)) : '暂无';
  const time = v => typeof v === 'string' ? v.replace('Asia/Shanghai', '北京时间').replace('T', ' ') : '暂无时间';
  const softFetch = async name => {
    try { const r = await fetch(`data/desk/${name}.json`, {cache:'no-store'}); return r.ok ? await r.json() : null; } catch { return null; }
  };
  const direction = v => clean(v) || '方向待确认';
  const renderOpp = o => {
    if (!o) { $('opp-panel').textContent = '暂无机会报告'; return; }
    const b = o.btc || {}, e = b.entry || {};
    const levels = (Array.isArray(e.levels) ? e.levels : []).map(l => {
      const price = Array.isArray(l.zone) ? l.zone.map(num).join('–') : num(l.level);
      const side = String(l.side || '');
      let lead;
      if (/short_supply|short_liquidity/.test(side)) lead = `回抽至 ${price} 一带做空观察`;
      else if (/invalidation/.test(side)) lead = `跌破 ${price} 则空头延续观察`;
      else if (/demand/.test(side)) lead = `现价附近需求区 ${price}，仅作防守观察`;
      else if (/long|demand/.test(side)) lead = `回抽至 ${price} 一带做多观察`;
      else lead = `关注 ${price}`;
      const roleZh = clean(l.role);
      return roleZh ? `<li>${esc(lead)}（${esc(roleZh)}）</li>` : `<li>${esc(lead)}</li>`;
    }).join('');
    $('opp-panel').innerHTML = `<p class="headline">${text(direction(b.bias_daily || o.market_context?.bias || o.action))}</p>
      <p class="entry-line">进场点：${text(e.status) || '待确认'} · ${text(e.preferred_side) || '方向待确认'} · 现价 ${esc(num(b.price_ref))}</p>
      <h3>多空建议</h3>${para(o.action)}${para(o.stance)}<ul>${levels}</ul>
      <h3>分析报告</h3>${[o.summary_for_desk,e.basis,b.view_4h,o.us_equity?.view,o.a_share?.view].map(para).join('') || '<p>暂无分析内容。</p>'}`;
  };
  const renderAnomaly = a => {
    if (!a) { $('anomaly-panel').textContent = '暂无异动报告'; return; }
    const items = (Array.isArray(a.items) ? a.items : []).slice(0,5);
    const r = a.resonance_verdict || {};
    const cautious = a.action === 'observe_only' && /跌|偏弱|risk_off/.test(a.summary || '');
    $('anomaly-panel').innerHTML = `<p class="headline">${text(direction(a.market_bias))} · ${text(a.action) || '建议待确认'}</p>
      <p class="entry-line">${esc(time(a.asof))}</p><h3>多空建议</h3>
      ${para(cautious ? '目前只观察、不下单。下跌后的反弹尚不足以确认企稳，先不追空，也不急于抄底，等待止跌或再次破位的信号。' : a.action)}
      <h3>分析报告</h3>${para(a.summary)}
      <ul>${items.map(i => `<li><strong>${esc(i.symbol || '相关标的')}</strong>：${text(i.read)}</li>`).join('')}</ul>
      ${para(r.tradifi_vs_news ? `传统金融与新闻的关联：${r.tradifi_vs_news}。` : '')}
      ${para(r.crypto_vs_news ? `加密市场与新闻的关联：${r.crypto_vs_news}。` : '')}
      ${para(Array.isArray(r.watch_next) ? `接下来关注：${r.watch_next.join('；')}。` : r.watch_next)}`;
  };
  Promise.all([softFetch('opp'), softFetch('anomaly')]).then(([o,a]) => {
    $('desk-asof').textContent = time(o?.asof || a?.asof);
    renderOpp(o); renderAnomaly(a);
  });
})();
