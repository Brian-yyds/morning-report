'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const payload = JSON.parse($('report-data').textContent);
  const dates = payload.manifest.dates.map(entry => entry.date);
  const sections = [
    {id: 'ai', title: 'AI热点', short: 'AI', symbol: 'AI', description: '模型 · 产品 · 行业动态'},
    {id: 'crypto', title: '加密热点', short: '加密', symbol: '币', description: '币安 · 链上 · 迷因币'},
    {id: 'stocks', title: '股票热点', short: '股票', symbol: '股', description: '美股 · 公司 · 市场观点'}
  ];
  const categories = {'干货': 'practical', '热点事件': 'news', '观点': 'opinion', '话题': 'discussion'};
  // crypto / stocks 新数据：欧美圈 + 华语圈各 20 条（region: west | zh）。
  const regions = {west: '欧美圈', zh: '华语圈'};
  const sorts = {rank: '排名', views: '浏览', likes: '点赞', engagement: '互动', latest: '最新'};
  const metricNames = [['views', '浏览'], ['likes', '赞'], ['retweets', '转'], ['replies', '评'], ['quotes', '引']];
  const storageKey = 'morning-report:dashboard:v1';
  const state = readPreferences();
  const columnNodes = {};
  const tabNodes = {};
  const categoryNodes = {};
  const distributionNodes = {};
  const expanded = new Set();
  let currentDate;
  let dayItems = {};
  let allItems = [];
  let overviewOpen = !window.matchMedia('(max-width: 767px)').matches;
  let searchTimer;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(className, text) {
    const node = element('button', className, text);
    node.type = 'button';
    return node;
  }
  function pressed(node, value) { node.setAttribute('aria-pressed', String(Boolean(value))); }
  function readPreferences() {
    let saved = {};
    try {
      const value = JSON.parse(localStorage.getItem(storageKey));
      if (value && typeof value === 'object' && !Array.isArray(value)) saved = value;
    } catch { /* Storage can be unavailable on file:// or in private browsing. */ }
    return {
      query: typeof saved.query === 'string' ? saved.query : '',
      categories: Array.isArray(saved.categories) ? [...new Set(saved.categories.filter(c => Object.hasOwn(categories, c)))] : [],
      ticker: typeof saved.ticker === 'string' ? normalizeTicker(saved.ticker) : '',
      hot: saved.hot === true,
      sort: Object.hasOwn(sorts, saved.sort) ? saved.sort : 'rank',
      columnSort: Object.fromEntries(sections.map(({id}) => [id, Object.hasOwn(sorts, saved.columnSort?.[id]) ? saved.columnSort[id] : ''])),
      density: saved.density === 'comfortable' ? 'comfortable' : 'compact',
      theme: ['system', 'light', 'dark'].includes(saved.theme) ? saved.theme : 'system',
      tab: sections.some(s => s.id === saved.tab) ? saved.tab : 'ai'
    };
  }
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Keep the dashboard usable without storage. */ }
  }
  function safeURL(value) {
    if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return '';
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.href : '';
    } catch { return ''; }
  }
  function link(text, url, className) {
    const href = safeURL(url);
    const node = element(href ? 'a' : 'span', className, text);
    if (href) { node.href = href; node.target = '_blank'; node.rel = 'noopener noreferrer'; }
    return node;
  }
  function number(value) { return Math.max(0, Number(value) || 0); }
  function formatNumber(value) {
    const n = number(value);
    if (n >= 1e8) return `${+(n / 1e8).toFixed(1)}亿`;
    if (n >= 1e4) return `${+(n / 1e4).toFixed(1)}万`;
    return String(n);
  }
  function formatTime(value, full = false) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return '时间未知';
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', ...(full ? {year: 'numeric', month: '2-digit', day: '2-digit'} : {}),
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(date);
  }
  function postedTime(value) {
    const elapsed = (Date.now() - Date.parse(value)) / 60000;
    if (elapsed >= 0 && elapsed < 1) return '刚刚';
    if (elapsed >= 1 && elapsed < 60) return `${Math.floor(elapsed)}分钟前`;
    if (elapsed >= 60 && elapsed < 360) return `${Math.floor(elapsed / 60)}小时前`;
    return formatTime(value);
  }
  function normalizeTicker(value) { return String(value).trim().replace(/^\$+/, '').toUpperCase(); }
  function categoryOf(item) { return Object.hasOwn(categories, item.category) ? item.category : '话题'; }
  function engagement(item) { return ['likes', 'retweets', 'replies', 'quotes'].reduce((sum, key) => sum + number(item.metrics?.[key]), 0); }
  function addSortOptions(select, withDefault = false) {
    if (withDefault) { const option = element('option', '', '跟随全局'); option.value = ''; select.append(option); }
    Object.entries(sorts).forEach(([value, label]) => {
      const option = element('option', '', `按${label}`); option.value = value; select.append(option);
    });
  }
  function applyAppearance() {
    if (state.theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = state.theme;
    document.body.dataset.density = state.density;
    $('theme-select').value = state.theme;
    document.querySelectorAll('button[data-density]').forEach(node => pressed(node, node.dataset.density === state.density));
  }
  function setTab(id, save = true) {
    state.tab = id;
    document.body.dataset.tab = id;
    sections.forEach(section => pressed(tabNodes[section.id], section.id === id));
    if (save) persist();
  }
  function setOverview() {
    $('overview-content').hidden = !overviewOpen;
    $('overview-toggle').textContent = overviewOpen ? '收起总览 ↑' : '展开总览 ↓';
    $('overview-toggle').setAttribute('aria-expanded', String(overviewOpen));
  }
  function setCategoryMenu(open) {
    $('category-filter').dataset.open = String(open);
    $('category-menu-toggle').setAttribute('aria-expanded', String(open));
  }
  function toggleCategory(category) {
    state.categories = state.categories.includes(category) ? state.categories.filter(c => c !== category) : [...state.categories, category];
    filtersChanged();
  }
  function toggleTicker(ticker) {
    state.ticker = state.ticker === ticker ? '' : ticker;
    filtersChanged();
    if (state.ticker) $('active-ticker').focus({preventScroll: true});
  }
  function tickerButton(ticker, count) {
    const node = button('ticker-chip');
    node.append(element('span', 'ticker-symbol', `$${ticker}`));
    node.dataset.ticker = ticker;
    node.title = count === undefined ? `筛选 $${ticker}` : `$${ticker} · 提及 ${count} 次，点击筛选所有栏目`;
    node.setAttribute('aria-label', node.title);
    pressed(node, state.ticker === ticker);
    if (count !== undefined) node.append(element('span', 'ticker-count', String(count)));
    node.addEventListener('click', () => toggleTicker(ticker));
    return node;
  }
  function buildShell() {
    addSortOptions($('global-sort'));
    Object.keys(categories).forEach(category => {
      const node = button('category-choice', category);
      pressed(node, false);
      node.addEventListener('click', () => toggleCategory(category));
      $('category-choices').append(node);
      categoryNodes[category] = node;
      const distribution = button('distribution-button');
      distribution.setAttribute('aria-label', `筛选${category}`);
      distribution.addEventListener('click', () => toggleCategory(category));
      const labels = element('span');
      const count = element('strong', '', '0');
      labels.append(element('span', '', category), count);
      const track = element('span', 'distribution-track');
      const fill = element('span', 'distribution-fill');
      track.append(fill);
      const share = element('span', 'distribution-share', '0%');
      distribution.append(labels, track, share);
      $('category-distribution').append(distribution);
      distributionNodes[category] = {node: distribution, count, fill, share};
    });
    sections.forEach(info => {
      const tab = button('section-tab');
      const tabCount = element('span', 'tab-count', '0');
      const tabSample = element('span', 'sample-badge', '样例数据');
      tabSample.hidden = true;
      tab.append(element('span', '', info.short), tabCount, tabSample);
      tab.setAttribute('aria-controls', info.id);
      tab.addEventListener('click', () => setTab(info.id));
      $('section-tabs').append(tab);
      tabNodes[info.id] = tab;
      const section = element('section', `report-section section-${info.id}`);
      section.id = info.id;
      section.setAttribute('aria-labelledby', `heading-${info.id}`);
      const header = element('div', 'section-header');
      const titleRow = element('div', 'section-title-row');
      const title = element('div', 'section-title');
      const symbol = element('span', 'section-symbol', info.symbol);
      symbol.setAttribute('aria-hidden', 'true');
      const h2 = element('h2', '', info.title); h2.id = `heading-${info.id}`;
      const count = element('span', 'section-count', '0');
      const sample = element('span', 'sample-badge', '样例数据'); sample.hidden = true;
      title.append(symbol, h2, count, sample);
      const sort = element('select', 'column-sort');
      sort.setAttribute('aria-label', `${info.title}排序`);
      addSortOptions(sort, true);
      sort.value = state.columnSort[info.id];
      sort.addEventListener('change', () => { state.columnSort[info.id] = sort.value; persist(); renderLists(info.id); });
      titleRow.append(title, sort);
      const subtitle = element('div', 'section-subtitle');
      const filtered = element('span', '', '已筛选 0/0');
      subtitle.append(element('span', '', info.description), filtered);
      header.append(titleRow, subtitle);
      const list = element('div', 'post-list');
      list.tabIndex = 0;
      list.setAttribute('role', 'region');
      list.setAttribute('aria-label', `${info.title}内容列表`);
      section.append(header, list);
      $('sections').append(section);
      columnNodes[info.id] = {section, count, sample, filtered, list, sort, tabCount, tabSample};
    });
    dates.forEach(day => { const option = element('option', '', day); option.value = day; $('date-select').append(option); });
    if (!dates.length) { $('date-select').append(element('option', '', '暂无日期')); $('date-select').disabled = true; }
  }
  function prepareItems(report) {
    dayItems = {};
    sections.forEach(({id}) => {
      const items = (report?.sections[id]?.items || []).map((item, index) => ({
        ...item, key: `${currentDate}:${id}:${index}`, engagement: engagement(item),
        tickerKeys: [...new Set((item.tickers || []).map(normalizeTicker).filter(Boolean))]
      }));
      const scores = items.map(item => item.engagement).sort((a, b) => b - a);
      const mean = scores.reduce((sum, score) => sum + score, 0) / (scores.length || 1);
      const threshold = scores[Math.max(0, Math.ceil(scores.length * .1) - 1)] || 0;
      const rates = items.map(item => number(item.metrics?.views) >= 100 ? item.engagement / item.metrics.views : 0);
      const rateMean = rates.reduce((sum, rate) => sum + rate, 0) / (rates.length || 1);
      const rateStd = Math.sqrt(rates.reduce((sum, rate) => sum + (rate - rateMean) ** 2, 0) / (rates.length || 1));
      items.forEach((item, index) => {
        const topEngagement = item.engagement > 0 && item.engagement >= threshold && (item.engagement > mean || items.length === 1);
        const highRate = rates.length >= 3 && rateStd > 0 && rates[index] > rateMean + 1.5 * rateStd && item.engagement >= mean / 2;
        item.hot = topEngagement || highRate;
        item.heatReason = topEngagement ? '互动量位于本栏目当日前 10%（至少 1 条），且高于均值' : '互动率显著高于本栏目当日平均水平';
        item.searchText = [item.text_zh, item.author_name, item.author_handle,
          item.author_handle ? `@${item.author_handle}` : '',
          ...item.tickerKeys.flatMap(ticker => [ticker, `$${ticker}`])].join(' ').toLocaleLowerCase();
      });
      dayItems[id] = items;
    });
    allItems = sections.flatMap(({id}) => dayItems[id]);
  }
  function renderOverview(report) {
    const cards = $('kpi-cards'); cards.replaceChildren();
    const values = sections.map(({id, title}) => ({label: title, value: dayItems[id].length, unit: '条', source: report?.sources[id]}));
    values.push({label: '累计浏览', value: allItems.reduce((sum, item) => sum + number(item.metrics?.views), 0), total: true});
    values.push({label: '累计互动', value: allItems.reduce((sum, item) => sum + item.engagement, 0), total: true});
    values.forEach(({label, value, unit, source, total}) => {
      const card = element('div', `kpi${total ? ' total' : ''}`);
      card.append(element('div', 'kpi-label', label));
      const main = element('div', 'kpi-value', total ? formatNumber(value) : String(value));
      main.title = `${label} ${value.toLocaleString('zh-CN')}${unit || ''}`;
      if (unit) main.append(element('span', 'kpi-unit', unit));
      card.append(main);
      if (source === 'sample') card.append(element('span', 'sample-badge kpi-source', '样例数据'));
      cards.append(card);
    });
    const tickers = new Map();
    allItems.forEach(item => item.tickerKeys.forEach(ticker => {
      const value = tickers.get(ticker) || {count: 0, engagement: 0};
      value.count++; value.engagement += item.engagement; tickers.set(ticker, value);
    }));
    const topTickers = [...tickers].sort((a, b) => b[1].count - a[1].count || b[1].engagement - a[1].engagement || a[0].localeCompare(b[0])).slice(0, 12);
    $('popular-tickers').replaceChildren(...topTickers.map(([ticker, value]) => tickerButton(ticker, value.count)));
    if (!topTickers.length) $('popular-tickers').append(element('span', 'muted', '暂无标的数据'));
    Object.keys(categories).forEach(category => {
      const count = allItems.filter(item => categoryOf(item) === category).length;
      const percent = allItems.length ? count / allItems.length * 100 : 0;
      const node = distributionNodes[category];
      node.count.textContent = count;
      node.share.textContent = `${Math.round(percent)}%`;
      node.fill.style.width = `${percent}%`;
      node.node.title = `${category} ${count} 条，占 ${Math.round(percent)}%；点击筛选（可多选）`;
    });
    $('day-summary').textContent = `${currentDate || '暂无日期'} · ${allItems.length} 条信息`;
  }
  function post(item) {
    const article = element('article', 'post');
    const regional = regions[item.region] && item.region_rank >= 1;
    const shown = regional ? item.region_rank : item.rank;
    const rank = element('span', `rank${shown <= 3 ? ' leading' : ''}`, String(shown).padStart(2, '0'));
    rank.setAttribute('aria-label', regional ? `${regions[item.region]}第 ${shown} 名（总第 ${item.rank} 名）` : `第 ${item.rank} 名`);
    article.append(rank);
    const header = element('div', 'post-header');
    const author = element('div', 'author');
    author.append(link(item.author_name, item.author_url, 'author-name'));
    if (item.author_handle) author.append(link(`@${item.author_handle}`, item.author_url, 'handle'));
    header.append(author, element('span', `category ${categories[categoryOf(item)]}`, item.category));
    article.append(header);
    if (item.tickerKeys.length || item.hot) {
      const tags = element('div', 'row-tags');
      item.tickerKeys.forEach(ticker => tags.append(tickerButton(ticker)));
      if (item.hot) { const heat = element('span', 'heat-badge', '🔥热度'); heat.title = item.heatReason; tags.append(heat); }
      article.append(tags);
    }
    const text = button('post-text');
    const content = element('span', 'post-text-content', item.text_zh);
    content.id = `text-${item.key.replaceAll(':', '-')}`;
    text.append(content);
    text.setAttribute('aria-expanded', String(expanded.has(item.key)));
    text.setAttribute('aria-controls', content.id);
    text.title = '点击展开或收起全文';
    text.addEventListener('click', () => {
      if (expanded.has(item.key)) expanded.delete(item.key); else expanded.add(item.key);
      text.setAttribute('aria-expanded', String(expanded.has(item.key)));
    });
    article.append(text);
    const bottom = element('div', 'post-bottom');
    const metrics = element('div', 'metrics');
    metricNames.forEach(([key, label]) => {
      const metric = element('span', 'metric');
      const value = number(item.metrics?.[key]);
      metric.title = `${label} ${value.toLocaleString('zh-CN')}`;
      metric.append(element('span', 'metric-label', label), element('span', 'metric-value', formatNumber(value)));
      metrics.append(metric);
    });
    const details = element('div', 'post-links');
    const time = element('time', '', postedTime(item.posted_at));
    time.title = `${formatTime(item.posted_at, true)}（北京时间）`;
    if (item.posted_at) time.dateTime = item.posted_at;
    details.append(time, link('原帖↗', item.tweet_url, 'original-link'));
    bottom.append(metrics, details);
    article.append(bottom);
    return article;
  }
  function matches(item, terms) {
    return (!state.categories.length || state.categories.includes(categoryOf(item))) &&
      (!state.ticker || item.tickerKeys.includes(state.ticker)) && (!state.hot || item.hot) &&
      terms.every(term => item.searchText.includes(term));
  }
  function compare(sort) {
    return (a, b) => {
      const difference = sort === 'latest' ? (Date.parse(b.posted_at) || 0) - (Date.parse(a.posted_at) || 0) :
        sort === 'engagement' ? b.engagement - a.engagement :
        sort === 'rank' ? a.rank - b.rank : number(b.metrics?.[sort]) - number(a.metrics?.[sort]);
      return difference || a.rank - b.rank;
    };
  }
  function regionGroups(items, visible) {
    const keys = [...Object.keys(regions), 'other'];
    const keyOf = item => regions[item.region] ? item.region : 'other';
    return keys.flatMap(key => {
      const total = items.filter(item => keyOf(item) === key).length;
      if (!total) return [];
      const members = visible.filter(item => keyOf(item) === key);
      const group = element('div', `region-group region-${key}`);
      const heading = element('h3', 'region-heading');
      heading.append(element('span', '', regions[key] || '其他'), element('span', 'region-count', members.length === total ? `${total}` : `${members.length}/${total}`));
      group.append(heading);
      if (members.length) group.append(...members.map(post));
      else group.append(element('p', 'region-empty muted', '该圈暂无匹配'));
      return [group];
    });
  }
  function renderLists(onlySection) {
    const terms = state.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    let total = 0;
    sections.forEach(({id, title}) => {
      const nodes = columnNodes[id];
      const items = dayItems[id] || [];
      const visible = items.filter(item => matches(item, terms)).sort(compare(state.columnSort[id] || state.sort));
      total += visible.length;
      nodes.filtered.textContent = `已筛选 ${visible.length}/${items.length}`;
      nodes.tabCount.textContent = String(visible.length);
      tabNodes[id].setAttribute('aria-label', `${title}，已筛选 ${visible.length}/${items.length}${nodes.sample.hidden ? '' : '，样例数据'}`);
      if (onlySection && onlySection !== id) return;
      const grouped = items.some(item => regions[item.region]);
      nodes.list.replaceChildren(...(grouped && visible.length ? regionGroups(items, visible) : visible.map(post)));
      nodes.list.scrollTop = 0;
      if (!visible.length) {
        const empty = element('div', 'empty');
        const symbol = element('span', 'empty-symbol', items.length ? '⌕' : '—'); symbol.setAttribute('aria-hidden', 'true');
        empty.append(symbol, element('p', '', items.length ? '没有匹配的内容' : '今日暂无数据'));
        nodes.list.append(empty);
      }
    });
    $('results-count').textContent = `已筛选 ${total}/${allItems.length}`;
  }
  function syncFilterControls() {
    ['global-search', 'mobile-search'].forEach(id => { if ($(id).value !== state.query) $(id).value = state.query; });
    $('global-sort').value = state.sort;
    Object.keys(categories).forEach(category => {
      pressed(categoryNodes[category], state.categories.includes(category));
      pressed(distributionNodes[category].node, state.categories.includes(category));
    });
    $('category-menu-toggle').textContent = state.categories.length ? `分类 · ${state.categories.length} ▾` : '全部分类 ▾';
    pressed($('hot-only'), state.hot);
    $('active-ticker').hidden = !state.ticker;
    $('active-ticker').textContent = state.ticker ? `$${state.ticker} ×` : '';
    $('active-ticker').setAttribute('aria-label', `移除 $${state.ticker} 标的筛选`);
    $('clear-filters').disabled = !state.query && !state.categories.length && !state.ticker && !state.hot;
    document.querySelectorAll('[data-ticker]').forEach(node => pressed(node, node.dataset.ticker === state.ticker));
  }
  function filtersChanged() {
    clearTimeout(searchTimer);
    persist(); syncFilterControls(); renderLists();
  }
  function requestedDate() {
    const query = new URLSearchParams(location.search).get('date');
    const match = location.hash.match(/^#(?:date=)?(\d{4}-\d{2}-\d{2})$/);
    return match ? match[1] : query;
  }
  function renderDay(day, requested) {
    currentDate = day;
    expanded.clear();
    $('date-select').value = day || '';
    const report = payload.reports[day];
    const samples = sections.filter(({id}) => report?.sources[id] === 'sample');
    $('sample-note').hidden = !samples.length;
    $('footer-sample').hidden = !samples.length;
    $('sample-note-text').textContent = `${samples.map(s => s.title).join('、')}使用样例数据，仅供预览；统计包含样例。`;
    const notice = $('date-notice');
    notice.hidden = Boolean(dates.length) && (!requested || dates.includes(requested));
    notice.textContent = dates.length ? `未找到 ${requested} 的早报，已展示最新日期。` : '暂无可用早报数据，等待更新。';
    const times = Object.values(report?.sections || {}).map(s => s.generated_at).filter(t => Number.isFinite(Date.parse(t)));
    times.sort((a, b) => Date.parse(b) - Date.parse(a));
    $('last-updated').textContent = times.length ? formatTime(times[0], true) : '暂无更新';
    if (times.length) $('last-updated').dateTime = times[0]; else $('last-updated').removeAttribute('datetime');
    $('last-updated').title = '各栏目最近生成时间（北京时间）';
    document.title = `${day ? `${day} · ` : ''}每日早报 · 信息监测台`;
    const index = dates.indexOf(day);
    $('previous-day').disabled = index < 0 || index >= dates.length - 1;
    $('next-day').disabled = index <= 0;
    prepareItems(report);
    sections.forEach(({id}) => {
      const nodes = columnNodes[id];
      nodes.count.textContent = String(dayItems[id].length);
      nodes.sample.hidden = nodes.tabSample.hidden = report?.sources[id] !== 'sample';
    });
    renderOverview(report); syncFilterControls(); renderLists();
  }
  function selectDay(day) {
    if (!dates.includes(day)) return;
    const url = new URL(location.href);
    url.searchParams.set('date', day);
    if (/^#(?:date=)?\d{4}-\d{2}-\d{2}$/.test(url.hash)) url.hash = '';
    try { history.pushState(null, '', url); }
    catch { location.hash = `date=${day}`; }
    renderDay(day);
  }
  function syncLocation() {
    const requested = requestedDate();
    const day = dates.includes(requested) ? requested : dates[0];
    if (day !== currentDate || requested) renderDay(day, requested);
    const section = location.hash.slice(1);
    if (sections.some(s => s.id === section)) setTab(section);
  }

  applyAppearance(); buildShell(); setTab(state.tab, false); setOverview();
  $('date-select').addEventListener('change', event => selectDay(event.target.value));
  $('previous-day').addEventListener('click', () => selectDay(dates[dates.indexOf(currentDate) + 1]));
  $('next-day').addEventListener('click', () => selectDay(dates[dates.indexOf(currentDate) - 1]));
  $('theme-select').addEventListener('change', event => { state.theme = event.target.value; applyAppearance(); persist(); });
  document.querySelectorAll('button[data-density]').forEach(node => node.addEventListener('click', () => {
    state.density = node.dataset.density; applyAppearance(); persist();
  }));
  $('overview-toggle').addEventListener('click', () => { overviewOpen = !overviewOpen; setOverview(); });
  $('global-sort').addEventListener('change', event => { state.sort = event.target.value; filtersChanged(); });
  $('hot-only').addEventListener('click', () => { state.hot = !state.hot; filtersChanged(); });
  $('active-ticker').addEventListener('click', () => { state.ticker = ''; filtersChanged(); });
  $('clear-filters').addEventListener('click', () => {
    state.query = ''; state.categories = []; state.ticker = ''; state.hot = false;
    filtersChanged();
  });
  ['global-search', 'mobile-search'].forEach(id => $(id).addEventListener('input', event => {
    state.query = event.target.value;
    persist();
    clearTimeout(searchTimer);
    // Do not rebuild the input, so selection and Chinese IME composition remain intact.
    searchTimer = setTimeout(filtersChanged, 140);
  }));
  $('category-menu-toggle').addEventListener('click', () => setCategoryMenu($('category-filter').dataset.open !== 'true'));
  document.addEventListener('click', event => { if (!$('category-filter').contains(event.target)) setCategoryMenu(false); });
  document.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      const menuWasOpen = $('category-filter').dataset.open === 'true';
      setCategoryMenu(false);
      if (menuWasOpen) $('category-menu-toggle').focus();
      if (state.query) { state.query = ''; filtersChanged(); }
    }
    const editing = event.target.closest('input, textarea, select, [contenteditable="true"]');
    if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      $(window.matchMedia('(max-width: 767px)').matches ? 'mobile-search' : 'global-search').focus();
    }
  });
  window.addEventListener('popstate', syncLocation);
  window.addEventListener('hashchange', syncLocation);
  renderDay(dates.includes(requestedDate()) ? requestedDate() : dates[0], requestedDate());
  const anchor = location.hash.slice(1);
  if (sections.some(s => s.id === anchor)) setTab(anchor);
  if ('ResizeObserver' in window) {
    const sizes = new ResizeObserver(entries => entries.forEach(entry => {
      const name = {'topbar': '--topbar-height', 'overview-area': '--overview-height', 'section-tabs': '--tabs-height'}[entry.target.id];
      document.documentElement.style.setProperty(name, `${entry.target.getBoundingClientRect().height}px`);
    }));
    ['topbar', 'overview-area', 'section-tabs'].forEach(id => sizes.observe($(id)));
  }
})();
