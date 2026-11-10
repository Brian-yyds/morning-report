'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const storageKey = 'morning-report:dashboard:v1';
  const page = document.body.dataset.page || 'home';
  const payload = JSON.parse(($('workbench-data') || {textContent: '{}'}).textContent || '{}');
  const market = payload.market || {items: []};
  const todos = payload.todos || {items: []};
  const hotspots = payload.hotspots || {};

  const dirLabel = {up: '看多', down: '看空', range: '区间', watch: '观察'};
  const stanceLabel = {agree: '同意', partial: '部分同意', disagree: '不同意', watch: '继续观察'};
  const resultLabel = {user_right: '用户判断成立', bot_right: 'bot 判断更准', both: '两边都成立', neither: '两边都不成立', partial: '部分成立'};
  const statusLabel = {open: '待开始', in_progress: '进行中', waiting: '等待中', done: '已完成', cancelled: '已取消'};
  const sourceLabel = {news: '新闻', twitter: '推特', analysis: '自身理解', other: '其他'};

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function todayStamp() {
    const fmt = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'});
    return fmt.format(new Date());
  }
  function formatDate(value) {
    if (!value) return '未定';
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(value);
    return `${Number(m[2])}月${Number(m[3])}日`;
  }
  function formatDateTime(value) {
    if (!value) return '';
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      return new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false}).format(d);
    } catch { return String(value); }
  }
  function formatPrice(value, currency) {
    if (value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    const text = n >= 1000 ? n.toLocaleString('zh-CN', {maximumFractionDigits: 2}) : String(n);
    return currency === 'USD' ? `$${text}` : text;
  }
  function pendingMarket(items) {
    return (items || []).filter(item => !item.outcome);
  }
  function activeTodos(items) {
    return (items || []).filter(item => !['done', 'cancelled'].includes(item.status));
  }
  function checkTodos(items) {
    const today = todayStamp();
    return activeTodos(items).filter(item => item.check_on && item.check_on <= today);
  }

  function applyTheme() {
    let theme = 'system';
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      if (['system', 'light', 'dark'].includes(saved.theme)) theme = saved.theme;
    } catch { /* ignore */ }
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = theme;
    const select = $('theme-select');
    if (select) select.value = theme;
  }
  function bindTheme() {
    const select = $('theme-select');
    if (!select) return;
    select.addEventListener('change', () => {
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch { saved = {}; }
      saved.theme = select.value;
      try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch { /* ignore */ }
      applyTheme();
    });
  }

  function empty(text) {
    const node = element('p', 'wb-empty', text);
    return node;
  }

  function marketCard(item, compact) {
    const card = element('article', 'wb-item');
    const head = element('div', 'wb-item-head');
    const title = element('h3', 'wb-item-title', `${item.asset_name || item.asset || '未命名'} ${item.asset && item.asset_name ? item.asset : ''}`.trim());
    const dir = item.user_view?.direction;
    const badge = element('span', `wb-badge dir-${dir || 'watch'}`, dirLabel[dir] || '观点');
    head.append(title, badge);
    if (item.outcome) head.append(element('span', `wb-badge result-${item.outcome.result || 'partial'}`, resultLabel[item.outcome.result] || '已核实'));
    else head.append(element('span', 'wb-badge pending', `${formatDate(item.verify_on)} 核实`));
    card.append(head);

    const view = item.user_view || {};
    const prices = element('p', 'wb-prices');
    prices.append(
      element('span', '', `当时 ${formatPrice(view.spot, item.currency)}`),
      element('span', 'wb-arrow', '→'),
      element('span', '', `目标 ${formatPrice(view.target, item.currency)}`)
    );
    card.append(prices);
    if (view.thesis) card.append(element('p', 'wb-body', view.thesis));
    if (compact) return card;

    if (item.bot_review?.summary) {
      const review = element('div', 'wb-review');
      const rh = element('p', 'wb-review-head', `${item.bot_review.author || '市场观察'}的再分析`);
      if (item.bot_review.stance) rh.append(element('span', 'wb-badge quiet', stanceLabel[item.bot_review.stance] || item.bot_review.stance));
      review.append(rh, element('p', 'wb-body', item.bot_review.summary));
      const sources = item.bot_review.sources || [];
      if (sources.length) {
        const list = element('ul', 'wb-sources');
        sources.forEach(src => {
          const li = element('li');
          const type = sourceLabel[src.type] || src.type || '来源';
          if (src.url) {
            const a = element('a', '', `${type}：${src.title || src.url}`);
            a.href = src.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
            li.append(a);
          } else {
            li.append(element('span', '', `${type}：${src.title || src.note || '—'}`));
          }
          if (src.note && src.title) li.append(element('span', 'muted', ` · ${src.note}`));
          list.append(li);
        });
        review.append(list);
      }
      card.append(review);
    }

    const foot = element('p', 'wb-foot');
    foot.append(element('span', '', `预定核实 ${formatDate(item.verify_on)}`));
    if (view.stated_at) foot.append(element('span', '', `提出于 ${formatDateTime(view.stated_at)}`));
    card.append(foot);

    if (item.outcome) {
      const out = element('div', 'wb-outcome');
      out.append(
        element('p', 'wb-review-head', '核实结果'),
        element('p', 'wb-body', `${formatDateTime(item.outcome.verified_at) || formatDate(item.verify_on)}，价格 ${formatPrice(item.outcome.price, item.currency)}。${resultLabel[item.outcome.result] || ''} ${item.outcome.note || ''}`.trim())
      );
      card.append(out);
    }
    return card;
  }

  function todoCard(item, compact) {
    const card = element('article', 'wb-item');
    const head = element('div', 'wb-item-head');
    head.append(
      element('h3', 'wb-item-title', item.title || '未命名待办'),
      element('span', `wb-badge status-${item.status || 'open'}`, statusLabel[item.status] || item.status || '待办')
    );
    card.append(head);
    const meta = element('p', 'wb-prices');
    if (item.due_on) meta.append(element('span', '', `截止 ${formatDate(item.due_on)}`));
    if (item.check_on) meta.append(element('span', '', `核对 ${formatDate(item.check_on)}`));
    if (meta.childNodes.length) card.append(meta);
    if (item.progress) card.append(element('p', 'wb-body', item.progress));
    if (compact) return card;
    if (item.plan) {
      const plan = element('div', 'wb-review');
      plan.append(element('p', 'wb-review-head', '怎么做'), element('p', 'wb-body', item.plan));
      card.append(plan);
    }
    const updates = item.updates || [];
    if (updates.length) {
      const list = element('ul', 'wb-timeline');
      updates.slice().reverse().forEach(row => {
        const li = element('li');
        li.append(element('time', '', formatDateTime(row.at)), element('span', '', row.text || ''));
        list.append(li);
      });
      card.append(list);
    }
    return card;
  }

  function renderHome() {
    const now = new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'long'}).format(new Date());
    const heading = $('wb-today');
    if (heading) heading.textContent = now;

    const tItems = todos.items || [];
    const mItems = market.items || [];
    const active = activeTodos(tItems);
    const dueCheck = checkTodos(tItems);
    const pending = pendingMarket(mItems);

    const gTodos = $('glance-todos');
    if (gTodos) gTodos.textContent = `${active.length} 件未完成`;
    const gTodosNote = $('glance-todos-note');
    if (gTodosNote) gTodosNote.textContent = dueCheck.length ? `${dueCheck.length} 件待核对` : '暂无今天要核对的事项';

    const gMarket = $('glance-market');
    if (gMarket) gMarket.textContent = `${pending.length} 条待核实`;
    const gMarketNote = $('glance-market-note');
    if (gMarketNote) {
      const next = pending.slice().sort((a, b) => String(a.verify_on).localeCompare(String(b.verify_on)))[0];
      gMarketNote.textContent = next ? `最近核实日 ${formatDate(next.verify_on)}` : '暂无待核实观点';
    }

    const counts = hotspots.counts || {};
    const total = ['ai', 'crypto', 'stocks'].reduce((sum, key) => sum + (Number(counts[key]) || 0), 0);
    const gHot = $('glance-hotspots');
    if (gHot) gHot.textContent = total ? `${total} 条今日热点` : '暂无监测数据';
    const gHotNote = $('glance-hotspots-note');
    if (gHotNote && hotspots.latest_date) gHotNote.textContent = `${hotspots.latest_date} · AI ${counts.ai || 0} / 加密 ${counts.crypto || 0} / 股票 ${counts.stocks || 0}`;

    const todoBox = $('home-todos');
    if (todoBox) {
      todoBox.replaceChildren();
      const show = (dueCheck.length ? dueCheck : active).slice(0, 5);
      if (!show.length) todoBox.append(empty('还没有待办。日常管家写入后会出现在这里。'));
      else show.forEach(item => todoBox.append(todoCard(item, true)));
    }
    const marketBox = $('home-market');
    if (marketBox) {
      marketBox.replaceChildren();
      const show = pending.slice().sort((a, b) => String(a.verify_on).localeCompare(String(b.verify_on))).slice(0, 5);
      if (!show.length) marketBox.append(empty('还没有待核实的观点。'));
      else show.forEach(item => marketBox.append(marketCard(item, true)));
    }
  }

  function bindFilters(containerSelector, onChange) {
    const buttons = document.querySelectorAll(`${containerSelector} .wb-filter`);
    buttons.forEach(btn => btn.addEventListener('click', () => {
      buttons.forEach(node => {
        const on = node === btn;
        node.classList.toggle('is-active', on);
        node.setAttribute('aria-pressed', String(on));
      });
      onChange(btn.dataset.filter);
    }));
  }

  function renderMarket(filter) {
    const box = $('market-list');
    if (!box) return;
    const items = market.items || [];
    const sample = $('market-sample');
    if (sample) sample.hidden = !market.sample;
    const meta = $('market-updated');
    if (meta) meta.textContent = market.updated_at ? `数据更新于 ${formatDateTime(market.updated_at)} 北京时间` : '';
    const list = items.filter(item => {
      if (filter === 'pending') return !item.outcome;
      if (filter === 'verified') return Boolean(item.outcome);
      return true;
    }).sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)));
    box.replaceChildren();
    if (!list.length) box.append(empty(filter === 'verified' ? '还没有已核实的观点。' : '还没有待核实的观点。'));
    else list.forEach(item => box.append(marketCard(item, false)));
  }

  function renderTodos(filter) {
    const box = $('todos-list');
    if (!box) return;
    const items = todos.items || [];
    const sample = $('todos-sample');
    if (sample) sample.hidden = !todos.sample;
    const meta = $('todos-updated');
    if (meta) meta.textContent = todos.updated_at ? `数据更新于 ${formatDateTime(todos.updated_at)} 北京时间` : '';
    const today = todayStamp();
    const list = items.filter(item => {
      if (filter === 'active') return !['done', 'cancelled'].includes(item.status);
      if (filter === 'check') return !['done', 'cancelled'].includes(item.status) && item.check_on && item.check_on <= today;
      if (filter === 'done') return ['done', 'cancelled'].includes(item.status);
      return true;
    }).sort((a, b) => String(a.due_on || a.check_on || '9999').localeCompare(String(b.due_on || b.check_on || '9999')));
    box.replaceChildren();
    if (!list.length) box.append(empty('这一栏暂时没有待办。'));
    else list.forEach(item => box.append(todoCard(item, false)));
  }

  applyTheme();
  bindTheme();
  if (page === 'home') renderHome();
  if (page === 'market') {
    renderMarket('pending');
    bindFilters('.wb-toolbar', renderMarket);
  }
  if (page === 'todos') {
    renderTodos('active');
    bindFilters('.wb-toolbar', renderTodos);
  }
})();
