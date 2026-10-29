(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'morning-report:trade:v1';
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const text = (value) => value == null || value === '' ? '—' : String(value);
  const esc = (value) => text(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (value, digits = 2) => finite(value) ? value.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
  const price = (value) => finite(value) ? num(value, Number.isInteger(value) ? 0 : 2) : text(value);
  const pnlClass = (value) => finite(value) && value > 0 ? 'positive' : finite(value) && value < 0 ? 'negative' : '';
  const pnl = (value) => `<span class="${pnlClass(value)}">${finite(value) && value > 0 ? '+' : ''}${num(value)}</span>`;
  const time = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? text(value) : new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).format(date);
  };
  const windowText = (trial) => `${text(trial?.start)} 至 ${text(trial?.end)}`;
  const winrate = (data) => {
    if (!finite(data.winrate)) return '暂无样本';
    const percent = finite(data.winrate_pct) ? data.winrate_pct : data.winrate * 100;
    return `${num(percent)}%`;
  };
  function statusClass(status) {
    if (/未触发|挂条件|待确认/.test(status)) return 'pending';
    if (/已触发|持有/.test(status)) return 'holding';
    return 'neutral';
  }
  function sideBadge(side) {
    const label = { long: '多', short: '空' }[side] || text(side);
    const style = side === 'long' ? 'side-long' : side === 'short' ? 'side-short' : 'neutral';
    return `<span class="trade-badge ${style}">${esc(label)}</span>`;
  }
  function kpi(label, value, detail = '') {
    return `<article class="trade-kpi"><p class="muted">${label}</p><div class="trade-kpi-value">${value}</div><p class="trade-kpi-detail muted">${detail}</p></article>`;
  }
  function render(summary, active, history) {
    const aggregates = history.aggregates || {};
    const prices = summary.last_price || active.last_price || {};
    const trial = summary.trial || history.trial || {};
    $('trade-meta').innerHTML = [
      `更新时间：${esc(time(summary.updated_at))}（北京时间）`,
      `BTC：${num(prices.btc)} / ETH：${num(prices.eth)}`,
      `现价时间：${esc(time(prices.asof))}`,
      `名义本金：${num(summary.notional_usd_per_trade, 0)} USD/单`,
      `试跑窗：${esc(windowText(trial))}`,
    ].map((part) => `<span>${part}</span>`).join('');
    $('trade-kpis').innerHTML = [
      kpi('当前计划数', num(summary.active_plan_count, 0), `已结束 ${num(summary.closed_all_count, 0)} 笔`),
      kpi('胜率', winrate(summary), `盈利 ${num(aggregates.win_count, 0)} / 亏损 ${num(aggregates.loss_count, 0)} 笔`),
      kpi('累计模拟盈亏 · USD', pnl(summary.cumulative_sim_pnl_usd), '试跑窗内已实现盈亏'),
      kpi('平均已实现 RR', num(summary.avg_realized_rr), `胜率样本 ${num(summary.closed_sample_count, 0)} 笔`),
      kpi('试跑窗', `<span class="trade-trial">${esc(windowText(trial))}</span>`, `累计 ${pnl(trial.cumulative_pnl_usd)} USD`),
    ].join('');
    $('plans-count').textContent = `${num(active.count, 0)} 条当前 · ${text(active.plan_pool_version)}`;
    $('trade-plans').innerHTML = active.plans.length ? active.plans.map((plan) => {
      const targets = Array.isArray(plan.tp) ? plan.tp.map((tp) => `${esc(price(tp.level))}（${esc(tp.role)}）`).join(' · ') : '';
      return `<article class="trade-plan">
        <div class="plan-heading"><h3>${esc(plan.id)} <span class="muted">${esc(plan.symbol)}</span></h3>${sideBadge(plan.side)}<span class="muted">${esc(plan.tf)}</span></div>
        <p><span class="trade-badge ${statusClass(plan.status)}">${esc(plan.status)}</span></p>
        ${plan.status_detail ? `<p class="plan-detail muted">${esc(plan.status_detail)}</p>` : ''}
        <dl class="plan-levels"><div><dt>入场</dt><dd>${esc(price(plan.entry))}</dd></div><div><dt>止损</dt><dd>${esc(price(plan.sl))}</dd></div><div><dt>主止盈</dt><dd>${esc(price(plan.tp_main))}</dd></div><div><dt>盈亏比</dt><dd>${esc(plan.rr_display)}</dd></div></dl>
        <p class="plan-targets muted">止盈梯度：${targets || '—'}</p>
        <dl class="plan-rules"><div><dt>触发</dt><dd>${esc(plan.trigger)}</dd></div><div><dt>失效</dt><dd>${esc(plan.invalidation)}</dd></div></dl>
        ${plan.mutex ? `<details class="plan-mutex muted"><summary>互斥条件</summary><p>${esc(plan.mutex)}</p></details>` : ''}
      </article>`;
    }).join('') : '<p class="trade-empty">暂无当前计划单</p>';
    $('history-summary').innerHTML = `已结束 ${num(aggregates.closed_count, 0)} 笔 · 胜率样本 ${num(aggregates.decided_count, 0)} 笔 · 盈利 ${num(aggregates.win_count, 0)} / 亏损 ${num(aggregates.loss_count, 0)} 笔 · 失效或取消 ${num(aggregates.invalid_or_cancel_count, 0)} 笔 · 胜率 ${winrate(aggregates)} · 平均已实现 RR ${num(aggregates.avg_realized_rr)} · 已实现盈亏 ${pnl(aggregates.realized_pnl_usd)} USD`;
    const results = { win: '盈利', loss: '亏损', invalid: '失效', cancelled: '取消' };
    const reasons = { tp_main: '主止盈', tp_partial: '部分止盈', sl: '止损', invalidation: '失效', mutex_cancel: '互斥取消', manual: '手动' };
    $('trade-history').innerHTML = history.trades.length ? `<div class="trade-table-wrap" tabindex="0" role="region" aria-label="已结束模拟单，可横向滚动"><table class="trade-table"><thead><tr>${['编号', '交易对', '方向', '结果', '结束原因', '已实现 RR', '盈亏 USD', '结束时间（北京时间）'].map((label) => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${history.trades.map((trade) => `<tr>
      <td>${esc(trade.id)}</td><td>${esc(trade.symbol)}</td><td>${sideBadge(trade.side)}</td>
      <td><span class="trade-badge ${trade.result === 'win' ? 'holding' : trade.result === 'loss' ? 'loss' : 'neutral'}">${esc(results[trade.result] || trade.result)}</span></td>
      <td>${esc(reasons[trade.exit_reason] || trade.exit_reason)}</td><td>${num(trade.realized_rr)}</td><td>${pnl(trade.pnl_usd)}</td><td>${esc(time(trade.closed_at))}</td>
    </tr>`).join('')}</tbody></table></div>` : '<p class="trade-empty">试跑期内暂无已结束模拟单</p>';
  }
  async function fetchJson(name) {
    const response = await fetch(`./data/trade/${name}.json`, { cache: 'no-cache' });
    if (!response.ok) throw new Error('数据请求失败');
    return response.json();
  }
  async function init() {
    let theme = 'system';
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (['system', 'light', 'dark'].includes(saved.theme)) theme = saved.theme;
    } catch { /* 存储不可用时仍可切换主题。 */ }
    const applyTheme = () => {
      if (theme === 'system') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.dataset.theme = theme;
      $('theme-select').value = theme;
    };
    applyTheme();
    $('theme-select').addEventListener('change', (event) => {
      theme = event.target.value;
      applyTheme();
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme })); } catch { /* 忽略存储限制。 */ }
    });
    try {
      const [summary, active, history] = await Promise.all(['summary', 'active', 'history'].map(fetchJson));
      if (!summary || !Array.isArray(active?.plans) || !Array.isArray(history?.trades)) throw new Error('数据格式异常');
      render(summary, active, history);
      $('trade-notice').hidden = true;
    } catch {
      $('trade-notice').textContent = '交易计划数据加载失败，请稍后刷新；若持续失败，请检查数据文件是否已发布。';
      $('trade-notice').hidden = false;
    } finally {
      $('trade-main').setAttribute('aria-busy', 'false');
    }
  }
  init();
})();
