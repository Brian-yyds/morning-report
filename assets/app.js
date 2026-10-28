'use strict';
(() => {
  const payload = JSON.parse(document.getElementById('report-data').textContent);
  const entries = payload.manifest.dates;
  const dates = entries.map(entry => entry.date);
  const sectionInfo = [['ai', 'AI热点', '人工智能的新进展与新思考', '01'], ['crypto', '加密热点', '链上动态与加密市场观察', '02'], ['stocks', '股票热点', '公司、行业与资本市场洞察', '03']];
  const categories = {'干货': 'practical', '热点事件': 'news', '观点': 'opinion', '话题': 'discussion'};
  const metricNames = [['views', '浏览'], ['likes', '点赞'], ['retweets', '转发'], ['replies', '回复'], ['quotes', '引用']];
  const select = document.getElementById('date-select');
  let currentDate;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function safeURL(value) {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  }
  function link(text, url, className) {
    const href = safeURL(url);
    const node = element(href ? 'a' : 'span', className, text);
    if (href) {
      node.href = href;
      node.target = '_blank';
      node.rel = 'noopener noreferrer';
    }
    return node;
  }
  function formatNumber(value) {
    const n = Number(value) || 0;
    if (n >= 1e8) return `${+(n / 1e8).toFixed(1)}亿`;
    if (n >= 1e4) return `${+(n / 1e4).toFixed(1)}万`;
    return String(n);
  }
  function formatTime(value, full = false) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return '时间未知';
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', ...(full ? {year: 'numeric'} : {}),
      month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
  }
  function card(item) {
    const article = element('article', 'card');
    const header = element('div', 'card-header');
    const rank = element('span', `rank${item.rank <= 3 ? ' leading' : ''}`, String(item.rank).padStart(2, '0'));
    rank.setAttribute('aria-label', `第 ${item.rank} 名`);
    const author = element('div', 'author');
    author.append(link(item.author_name, item.author_url, 'author-name'), link(item.author_handle ? `@${item.author_handle}` : '未提供账号', item.author_url, 'handle'));
    header.append(rank, author, element('span', `category ${categories[item.category] || 'discussion'}`, item.category));
    article.append(header);
    if (item.tickers.length) {
      const tickers = element('div', 'tickers');
      item.tickers.forEach(ticker => tickers.append(element('span', 'ticker', `$${ticker}`)));
      article.append(tickers);
    }
    article.append(element('p', 'post-text', item.text_zh));
    const details = element('div', 'post-details');
    const time = element('time', '', formatTime(item.posted_at));
    if (item.posted_at) time.dateTime = item.posted_at;
    details.append(time, link('查看原帖 ↗', item.tweet_url, 'original-link'));
    article.append(details);
    const metrics = element('div', 'metrics');
    metricNames.forEach(([key, label]) => {
      const metric = element('span', 'metric');
      metric.title = `${label} ${item.metrics[key]}`;
      metric.append(element('span', 'metric-label', label), element('span', 'metric-value', formatNumber(item.metrics[key])));
      metrics.append(metric);
    });
    article.append(metrics);
    return article;
  }
  function requestedDate() {
    const query = new URLSearchParams(location.search).get('date');
    // Both #2026-10-28 and #date=2026-10-28 are accepted; section anchors remain usable.
    const match = location.hash.match(/^#(?:date=)?(\d{4}-\d{2}-\d{2})$/);
    return match ? match[1] : query;
  }
  function render(day, requested) {
    currentDate = day;
    select.value = day || '';
    const report = payload.reports[day];
    const sampleSections = sectionInfo.filter(([id]) => report?.sources[id] === 'sample');
    const sample = sampleSections.length > 0;
    document.getElementById('sample-note-text').textContent = sampleSections.map(([, title]) => title).join('、') +
      (payload.manifest.source === 'sample' ? ' 当前展示样例数据，仅用于预览排版' : ' 暂无真实数据，当前展示样例数据，仅用于预览排版');
    document.getElementById('sample-badge').hidden = !sample;
    document.getElementById('sample-note').hidden = !sample;
    const notice = document.getElementById('date-notice');
    notice.hidden = !requested || dates.includes(requested);
    notice.textContent = dates.length ? `未找到 ${requested} 的早报，已展示最新日期。` : '暂无可用早报数据。';
    if (!dates.length) notice.hidden = false;
    const times = Object.values(report?.sections || {}).map(s => s.generated_at).filter(Boolean);
    times.sort((a, b) => new Date(b) - new Date(a));
    document.getElementById('subtitle').textContent = day ? `${day.replaceAll('-', '.')} · 生成时间：${formatTime(times[0], true)}（北京时间）` : '暂无早报 · 等待数据更新';
    document.title = day ? `${day} · 每日早报` : '每日早报';
    const container = document.getElementById('sections');
    container.replaceChildren();
    sectionInfo.forEach(([id, title, description, number]) => {
      const items = report?.sections[id]?.items || [];
      const isSample = report?.sources[id] === 'sample';
      document.getElementById(`sample-${id}`).hidden = !isSample;
      document.getElementById(`count-${id}`).textContent = items.length;
      const section = element('section', `report-section section-${id}`);
      section.id = id;
      section.setAttribute('aria-labelledby', `heading-${id}`);
      const heading = element('div', 'section-heading');
      const titleGroup = element('div', 'section-title');
      titleGroup.append(element('span', 'section-number', number));
      const h2 = element('h2', '', title);
      h2.id = `heading-${id}`;
      titleGroup.append(h2);
      if (isSample) titleGroup.append(element('span', 'sample-badge', '样例数据'));
      heading.append(titleGroup, element('span', 'section-total', `精选 ${items.length} 条`));
      section.append(heading, element('p', 'section-description', description));
      const grid = element('div', 'card-grid');
      if (items.length) items.forEach(item => grid.append(card(item)));
      else grid.append(element('div', 'empty', '今日暂无数据'));
      section.append(grid);
      container.append(section);
    });
  }
  dates.forEach(day => {
    const option = element('option', '', day);
    option.value = day;
    select.append(option);
  });
  if (!dates.length) {
    select.append(element('option', '', '暂无日期'));
    select.disabled = true;
  }
  function syncLocation() {
    const requested = requestedDate();
    const day = dates.includes(requested) ? requested : dates[0];
    if (day !== currentDate || requested) render(day, requested);
  }
  select.addEventListener('change', () => {
    const url = new URL(location.href);
    url.searchParams.set('date', select.value);
    if (/^#(?:date=)?\d{4}-\d{2}-\d{2}$/.test(url.hash)) url.hash = '';
    try { history.pushState(null, '', url); }
    catch { location.hash = `date=${select.value}`; }
    render(select.value);
  });
  window.addEventListener('popstate', syncLocation);
  window.addEventListener('hashchange', syncLocation);
  render(dates.includes(requestedDate()) ? requestedDate() : dates[0], requestedDate());
})();
