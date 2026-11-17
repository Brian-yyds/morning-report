'use strict';
(() => {
  if (document.body?.dataset.page !== 'focus') return;

  const $ = id => document.getElementById(id);
  const REPO = 'Brian-yyds/morning-report';
  const API = 'https://api.github.com';
  const TOKEN_KEY = 'morning-report:trade-journal:token';
  const DRAFT_KEY = 'morning-report:focus:watchlist-draft:v1';
  const SCHEMA = 'focus/v1';
  const EMPTY_SECTION = '暂无采集到的内容';
  const BUILTIN_ALIASES = {
    BTC: ['Bitcoin', '比特币', '$BTC', 'BTCUSDT'],
    ETH: ['Ethereum', '以太坊', '$ETH', 'ETHUSDT'],
    SOL: ['Solana', '索拉纳', '$SOL', 'SOLUSDT'],
    BNB: ['$BNB', 'BNBUSDT', '币安币'],
    XRP: ['$XRP', '瑞波', 'Ripple', 'XRPUSDT'],
    DOGE: ['Dogecoin', '狗狗币', '$DOGE'],
    USDT: ['Tether', '$USDT'],
    USDC: ['USD Coin', '$USDC'],
  };

  const state = {
    watchlist: emptyWatchlist(),
    publishedUpdatedAt: '',
    draftDirty: false,
    index: null,
    detail: null,
    date: todayStamp(),
    selectedId: '',
    saving: false,
    statusTimer: 0,
  };

  function emptyWatchlist() {
    return {schema: SCHEMA, updated_at: '', sample: false, assets: []};
  }

  function todayStamp() {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    });
    return fmt.format(new Date());
  }

  function nowISO() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type)?.value || '00';
    const hour = get('hour') === '24' ? '00' : get('hour');
    return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}+08:00`;
  }

  function formatDate(value) {
    const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(value || '');
    return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
  }

  function formatDateTime(value) {
    if (!value) return '';
    try {
      const normalized = String(value).trim()
        .replace(' +0800', '+08:00')
        .replace(' ', 'T');
      const d = new Date(normalized);
      if (Number.isNaN(d.getTime())) return String(value);
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(d) + '（北京时间）';
    } catch {
      return String(value);
    }
  }

  function formatCount(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万`;
    return String(Math.round(n));
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function safeHref(value) {
    const text = String(value || '').trim();
    if (text.startsWith('https://') || text.startsWith('http://')) return text;
    return '';
  }

  function setStatus(message, kind) {
    const node = $('focus-status');
    if (!node) return;
    node.textContent = message || '';
    node.dataset.kind = kind || '';
    if (state.statusTimer) clearTimeout(state.statusTimer);
    if (message && kind !== 'error') {
      state.statusTimer = setTimeout(() => {
        if (node.textContent === message) {
          node.textContent = '';
          node.dataset.kind = '';
        }
      }, 8000);
    }
  }

  function getToken() {
    try { return String(localStorage.getItem(TOKEN_KEY) || ''); }
    catch { return ''; }
  }

  function setToken(value) {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* ignore quota */ }
  }

  function loadDraft() {
    try {
      const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (raw && raw.watchlist && Array.isArray(raw.watchlist.assets)) return raw;
    } catch { /* ignore */ }
    return null;
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        watchlist: state.watchlist,
        dirty: state.draftDirty,
        saved_at: nowISO(),
      }));
    } catch { /* ignore quota */ }
  }

  function clearDraftFlag() {
    state.draftDirty = false;
    saveDraft();
  }

  function assetIdFrom(symbol, existing) {
    const cleaned = String(symbol || '').trim().replace(/[^\w.-]/g, '');
    let base = cleaned || 'asset';
    const taken = new Set((existing || []).map(item => String(item.id || '').toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    let i = 2;
    while (taken.has(`${base}-${i}`.toLowerCase())) i += 1;
    return `${base}-${i}`;
  }

  function defaultAliases(symbol, kind, name) {
    const upper = String(symbol || '').replace(/\$/g, '').trim();
    const aliases = [];
    const builtin = BUILTIN_ALIASES[upper.toUpperCase()];
    if (builtin) aliases.push(...builtin);
    if (name) aliases.push(name);
    if (kind === 'stock') {
      if (/^\d{6}$/.test(upper)) aliases.push(`${upper}(A股)`);
      else if (/\.HK$/i.test(upper) || /^\d{1,5}$/.test(upper)) {
        const padded = upper.replace(/\.HK$/i, '').padStart(4, '0');
        aliases.push(`${padded}.HK`, `${padded}.HK(港股)`);
      } else if (/^[A-Za-z]/.test(upper)) {
        aliases.push(`${upper.toUpperCase()}(美股)`, `$${upper.toUpperCase()}`);
      }
    } else {
      const base = upper.toUpperCase();
      if (base) aliases.push(`$${base}`, `${base}USDT`);
    }
    const seen = new Set();
    return aliases.filter(item => {
      const key = String(item).trim().toLowerCase();
      if (!key || key === upper.toLowerCase() || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function parseAliases(text) {
    return String(text || '').split(/[,，;；]/).map(part => part.trim()).filter(Boolean);
  }

  function assets() {
    return Array.isArray(state.watchlist.assets) ? state.watchlist.assets : [];
  }

  function refreshTokenState() {
    const node = $('focus-token-state');
    if (!node) return;
    node.textContent = getToken()
      ? '这台浏览器里已经有令牌（与交割单分析页共用）。'
      : '还没有令牌。没有令牌时可以先改名单，内容会留在本机草稿里。';
  }

  function openSettings(focusInput) {
    const panel = $('focus-settings');
    const button = $('focus-settings-btn');
    if (!panel) return;
    const hide = !focusInput && !panel.hidden ? true : false;
    panel.hidden = hide;
    if (button) button.setAttribute('aria-expanded', hide ? 'false' : 'true');
    if (!hide) {
      refreshTokenState();
      const input = $('focus-token');
      if (focusInput) input?.focus();
    }
  }

  async function fetchJson(url) {
    const response = await fetch(url, {cache: 'no-store'});
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`读取 ${url} 失败（${response.status}）`);
    return response.json();
  }

  function dataPath(rel) {
    return `data/focus/${rel}`;
  }

  function utf8ToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function apiHeaders(token) {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  async function api(token, method, path, body) {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        ...apiHeaders(token),
        ...(body !== undefined ? {'Content-Type': 'application/json'} : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = {message: text}; }
    if (!response.ok) {
      const message = data && data.message ? data.message : `GitHub API ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function githubCommit(token, files, message) {
    const ref = await api(token, 'GET', `/repos/${REPO}/git/ref/heads/main`);
    const commitSha = ref.object.sha;
    const commit = await api(token, 'GET', `/repos/${REPO}/git/commits/${commitSha}`);
    const entries = [];
    for (const file of files) {
      const content = utf8ToBase64(file.content);
      const blob = await api(token, 'POST', `/repos/${REPO}/git/blobs`, {content, encoding: 'base64'});
      entries.push({path: file.path, mode: '100644', type: 'blob', sha: blob.sha});
    }
    const tree = await api(token, 'POST', `/repos/${REPO}/git/trees`, {
      base_tree: commit.tree.sha,
      tree: entries,
    });
    const created = await api(token, 'POST', `/repos/${REPO}/git/commits`, {
      message,
      tree: tree.sha,
      parents: [commitSha],
    });
    await api(token, 'PATCH', `/repos/${REPO}/git/refs/heads/main`, {sha: created.sha});
    return created.sha;
  }

  function normalizeWatchlist(raw) {
    const list = emptyWatchlist();
    if (!raw || typeof raw !== 'object') return list;
    list.updated_at = typeof raw.updated_at === 'string' ? raw.updated_at : '';
    list.sample = false;
    list.assets = Array.isArray(raw.assets) ? raw.assets.filter(item => item && (item.id || item.symbol)) : [];
    return list;
  }

  function selectedAsset() {
    const list = assets();
    if (!list.length) return null;
    return list.find(item => String(item.id) === state.selectedId) || list[0];
  }

  function setSelected(id, pushHash) {
    state.selectedId = id || '';
    if (pushHash) {
      const hash = state.selectedId ? `#${encodeURIComponent(state.selectedId)}` : '';
      if (hash !== location.hash) {
        history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
      }
    }
  }

  function hashId() {
    const raw = decodeURIComponent((location.hash || '').replace(/^#/, '')).trim();
    return raw;
  }

  function renderPills() {
    const root = $('focus-pills');
    const meta = $('focus-watch-meta');
    const list = assets();
    if (meta) {
      meta.textContent = list.length
        ? `${list.length} 个标的${state.draftDirty ? ' · 有未保存的草稿' : ''}`
        : (state.draftDirty ? '名单还是空的，有未保存的草稿' : '名单还是空的，先在上面添加');
    }
    if (!root) return;
    root.innerHTML = '';
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'wb-empty';
      empty.textContent = '还没有重点标的。添加后，保存名单，本机汇总脚本会把已采集到的内容归到对应标的下面。';
      root.append(empty);
      return;
    }
    const groups = [
      {key: 'crypto', label: '加密货币'},
      {key: 'stock', label: '股票'},
    ];
    for (const group of groups) {
      const items = list.filter(item => (item.kind || 'crypto') === group.key);
      if (!items.length) continue;
      const wrap = document.createElement('div');
      wrap.className = 'focus-pill-group';
      const label = document.createElement('p');
      label.className = 'focus-pill-label';
      label.textContent = group.label;
      const row = document.createElement('div');
      row.className = 'focus-pill-row';
      row.setAttribute('role', 'tablist');
      row.setAttribute('aria-label', group.label);
      for (const item of items) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'focus-pill';
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', item.id === state.selectedId ? 'true' : 'false');
        if (item.id === state.selectedId) btn.classList.add('is-active');
        const title = document.createElement('span');
        title.className = 'focus-pill-symbol';
        title.textContent = item.symbol || item.id;
        btn.append(title);
        if (item.name) {
          const name = document.createElement('span');
          name.className = 'focus-pill-name';
          name.textContent = item.name;
          btn.append(name);
        }
        btn.addEventListener('click', () => {
          setSelected(item.id, true);
          renderPills();
          loadDetail();
        });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'focus-pill-remove';
        remove.setAttribute('aria-label', `从名单移除 ${item.symbol || item.id}`);
        remove.textContent = '×';
        remove.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          removeAsset(item.id);
        });
        btn.append(remove);
        row.append(btn);
      }
      wrap.append(label, row);
      root.append(wrap);
    }
  }

  function metricLine(metrics) {
    if (!metrics) return '';
    const parts = [];
    if (metrics.views) parts.push(`浏览 ${formatCount(metrics.views)}`);
    if (metrics.likes) parts.push(`赞 ${formatCount(metrics.likes)}`);
    if (metrics.retweets) parts.push(`转 ${formatCount(metrics.retweets)}`);
    return parts.join(' · ');
  }

  function renderEmpty(text) {
    return `<p class="wb-empty">${escapeHtml(text || EMPTY_SECTION)}</p>`;
  }

  function renderLink(url, label) {
    const href = safeHref(url);
    if (!href) return '';
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label || '来源')}</a>`;
  }

  function renderTwitter(items) {
    if (!items || !items.length) return renderEmpty(EMPTY_SECTION);
    return `<ul class="focus-feed">${items.map(item => {
      const handle = item.author_handle ? `@${String(item.author_handle).replace(/^@/, '')}` : '';
      const authorLink = safeHref(item.author_url) || (handle ? `https://x.com/${encodeURIComponent(handle.replace(/^@/, ''))}` : '');
      const author = item.author_name || handle || '匿名作者';
      const tweetLink = renderLink(item.tweet_url, '原推');
      const authorHtml = authorLink
        ? `<a href="${escapeHtml(authorLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(author)}</a>`
        : escapeHtml(author);
      const badges = [
        item.hot ? '<span class="wb-badge focus-hot">热门</span>' : '',
        item.category ? `<span class="wb-badge">${escapeHtml(item.category)}</span>` : '',
        item.source_date && item.source_date !== state.date
          ? `<span class="wb-badge">来源日期 ${escapeHtml(item.source_date)}</span>`
          : '',
      ].filter(Boolean).join(' ');
      return `<li class="focus-item">
        <div class="focus-item-head">
          <p class="focus-item-title">${authorHtml}${handle && item.author_name ? ` <span class="focus-handle">${escapeHtml(handle)}</span>` : ''}</p>
          ${badges}
        </div>
        <p class="focus-item-body">${escapeHtml(item.text_zh || '')}</p>
        <p class="focus-item-meta">${escapeHtml(formatDateTime(item.posted_at))}${metricLine(item.metrics) ? ' · ' + escapeHtml(metricLine(item.metrics)) : ''}${tweetLink ? ' · ' + tweetLink : ''}</p>
      </li>`;
    }).join('')}</ul>`;
  }

  function renderArticles(items, emptyText) {
    if (!items || !items.length) return renderEmpty(emptyText || EMPTY_SECTION);
    return `<ul class="focus-feed">${items.map(item => {
      const source = item.source_id ? `<span>${escapeHtml(item.source_id)}</span>` : '';
      const link = renderLink(item.url, '来源');
      const importance = item.importance ? `<span class="wb-badge">重要 ${escapeHtml(item.importance)}</span>` : '';
      return `<li class="focus-item">
        <div class="focus-item-head">
          <p class="focus-item-title">${escapeHtml(item.title || '（无标题）')}</p>
          ${importance}
        </div>
        ${item.summary ? `<p class="focus-item-body">${escapeHtml(item.summary)}</p>` : ''}
        <p class="focus-item-meta">${escapeHtml(formatDateTime(item.published_at || item.happened_at))}${source ? ' · ' + source : ''}${link ? ' · ' + link : ''}</p>
      </li>`;
    }).join('')}</ul>`;
  }

  function renderOnchain(asset, items) {
    if ((asset?.kind || '') === 'stock') {
      return renderEmpty('股票没有链上采集，本板块不适用。');
    }
    if (!items || !items.length) return renderEmpty(EMPTY_SECTION);
    return renderArticles(items.map(item => ({
      title: item.title,
      summary: item.summary,
      url: item.url,
      published_at: item.happened_at,
      source_id: item.source,
    })));
  }

  function sourceNote(detail) {
    const dates = detail?.source_dates || {};
    const notes = [];
    if (dates.twitter && dates.twitter !== state.date) {
      notes.push(`推特用的是 ${dates.twitter} 的采集（当天还没有更新）`);
    }
    if (dates.onchain && dates.onchain !== state.date) {
      notes.push(`链上用的是 ${dates.onchain} 的采集`);
    }
    return notes;
  }

  function renderRoot() {
    const root = $('focus-root');
    if (!root) return;
    const asset = selectedAsset();
    if (!asset) {
      root.innerHTML = `<section class="wb-panel"><p class="wb-empty">先在上面的名单里添加币或股票。保存后，汇总脚本会把已有采集归进来。没有数据的板块会显示「${EMPTY_SECTION}」，不会填写示例观点。</p></section>`;
      return;
    }
    const label = [asset.symbol || asset.id, asset.name].filter(Boolean).join(' · ');
    const counts = state.index?.assets?.find(item => item.id === asset.id);
    const notes = sourceNote(state.detail);
    const detail = state.detail && state.detail.id === asset.id ? state.detail : null;
    root.innerHTML = `
      <section class="focus-selected">
        <div class="wb-panel-head">
          <h3>${escapeHtml(label)}</h3>
          <p class="wb-meta">${escapeHtml(formatDate(state.date))}（北京时间）${detail?.updated_at ? ' · 汇总于 ' + escapeHtml(formatDateTime(detail.updated_at)) : ''}</p>
        </div>
        ${notes.length ? `<p class="focus-source-note">${notes.map(escapeHtml).join('；')}</p>` : ''}
        ${!detail ? `<p class="wb-empty">${state.index === null ? '正在读取当天汇总…' : EMPTY_SECTION}</p>` : ''}
      </section>
      <section class="wb-panel focus-section" id="focus-twitter">
        <div class="wb-panel-head"><h3>推特观点</h3><p class="wb-meta">${counts ? counts.twitter + ' 条' : ''}</p></div>
        ${detail ? renderTwitter(detail.twitter) : renderEmpty(state.index === null ? '正在读取…' : EMPTY_SECTION)}
      </section>
      <section class="wb-panel focus-section" id="focus-news">
        <div class="wb-panel-head"><h3>新闻</h3><p class="wb-meta">${counts ? counts.news + ' 条' : ''}</p></div>
        ${detail ? renderArticles(detail.news) : renderEmpty(state.index === null ? '正在读取…' : EMPTY_SECTION)}
      </section>
      <section class="wb-panel focus-section" id="focus-announcements">
        <div class="wb-panel-head"><h3>重大公告</h3><p class="wb-meta">${counts ? counts.announcements + ' 条' : ''}</p></div>
        ${detail ? renderArticles(detail.announcements) : renderEmpty(state.index === null ? '正在读取…' : EMPTY_SECTION)}
      </section>
      <section class="wb-panel focus-section" id="focus-onchain">
        <div class="wb-panel-head"><h3>链上动静</h3><p class="wb-meta">${asset.kind === 'stock' ? '不适用' : (counts ? counts.onchain + ' 条' : '')}</p></div>
        ${detail ? renderOnchain(asset, detail.onchain) : renderOnchain(asset, [])}
      </section>
    `;
  }

  async function loadDetail() {
    const asset = selectedAsset();
    state.detail = null;
    renderRoot();
    if (!asset) return;
    const bust = `t=${Date.now()}`;
    try {
      const index = await fetchJson(`${dataPath(`${state.date}/index.json`)}?${bust}`);
      state.index = index;
      if (!index) {
        renderRoot();
        return;
      }
      const file = await fetchJson(`${dataPath(`${state.date}/${asset.id}.json`)}?${bust}`);
      state.detail = file && file.sample === true ? {...file, twitter: [], news: [], announcements: [], onchain: [], sample: false} : file;
      // Defensive: never display sample/example items if a file is marked sample
      if (file && file.sample === true) state.detail = {id: asset.id, twitter: [], news: [], announcements: [], onchain: []};
      renderRoot();
    } catch (error) {
      state.index = null;
      setStatus(`读取当天汇总失败：${error.message || error}`, 'error');
      renderRoot();
    }
  }

  function addAsset(event) {
    event.preventDefault();
    const symbolInput = $('focus-symbol');
    const kind = ($('focus-kind')?.value || 'crypto') === 'stock' ? 'stock' : 'crypto';
    const symbol = (symbolInput?.value || '').trim();
    const name = ($('focus-name')?.value || '').trim();
    const extra = parseAliases($('focus-aliases')?.value || '');
    if (!symbol) {
      setStatus('请填写代号，例如 BTC 或 NVDA。', 'error');
      symbolInput?.focus();
      return;
    }
    const aliases = [...defaultAliases(symbol, kind, name), ...extra];
    const id = assetIdFrom(symbol, assets());
    const item = {
      id,
      symbol,
      name,
      kind,
      aliases,
      created_at: nowISO(),
    };
    state.watchlist.assets = [...assets(), item];
    state.watchlist.updated_at = nowISO();
    state.watchlist.sample = false;
    state.draftDirty = true;
    setSelected(id, true);
    saveDraft();
    if (symbolInput) symbolInput.value = '';
    if ($('focus-name')) $('focus-name').value = '';
    if ($('focus-aliases')) $('focus-aliases').value = '';
    renderPills();
    loadDetail();
    setStatus('已加入本机草稿。要点「保存名单」才会发布到网站。', 'ok');
  }

  function removeAsset(id) {
    state.watchlist.assets = assets().filter(item => item.id !== id);
    state.watchlist.updated_at = nowISO();
    state.draftDirty = true;
    if (state.selectedId === id) {
      setSelected(assets()[0]?.id || '', true);
    }
    saveDraft();
    renderPills();
    loadDetail();
    setStatus('已从本机草稿中移除。要点「保存名单」才会同步到网站。', 'ok');
  }

  async function handleSave() {
    if (state.saving) return;
    saveDraft();
    const token = getToken();
    if (!token) {
      openSettings(true);
      setStatus('还没有设置 GitHub 令牌。名单已先存在本机草稿里；到设置里放入与交割单分析页同一枚令牌后再点保存，才会发布到网站。', 'error');
      return;
    }
    state.saving = true;
    const button = $('focus-save');
    if (button) button.disabled = true;
    setStatus('正在保存名单到网站…');
    try {
      const payload = {
        schema: SCHEMA,
        updated_at: nowISO(),
        sample: false,
        assets: assets().map(item => ({
          id: item.id,
          symbol: item.symbol || item.id,
          name: item.name || '',
          kind: item.kind === 'stock' ? 'stock' : 'crypto',
          aliases: Array.isArray(item.aliases) ? item.aliases.filter(v => typeof v === 'string' && v.trim()) : [],
          created_at: item.created_at || nowISO(),
        })),
      };
      await githubCommit(token, [{
        path: 'data/focus/watchlist.json',
        content: JSON.stringify(payload, null, 2) + '\n',
      }], `重点分析名单 ${todayStamp()}`);
      state.watchlist = payload;
      state.publishedUpdatedAt = payload.updated_at;
      clearDraftFlag();
      renderPills();
      setStatus('名单已保存到网站仓库。公开页面通常几十秒到一分钟后能看到；本机汇总脚本随后会按这份名单归集内容。', 'ok');
    } catch (error) {
      const hint = error.status === 401 || error.status === 403
        ? '令牌无效，或没有对 Brian-yyds/morning-report 的 Contents 写权限。请在设置里更换与交割单分析页相同的令牌。'
        : error.status === 409
          ? '仓库刚刚有了新的提交，请再点一次保存。'
          : (error.message || '保存失败。');
      setStatus(`保存失败：${hint}`, 'error');
    } finally {
      state.saving = false;
      if (button) button.disabled = false;
    }
  }

  async function loadWatchlist() {
    const bust = `t=${Date.now()}`;
    let remote = null;
    try {
      remote = normalizeWatchlist(await fetchJson(`${dataPath('watchlist.json')}?${bust}`));
    } catch (error) {
      setStatus(`读取线上名单失败：${error.message || error}`, 'error');
      remote = emptyWatchlist();
    }
    state.publishedUpdatedAt = remote.updated_at || '';
    const draft = loadDraft();
    const draftList = draft ? normalizeWatchlist(draft.watchlist) : null;
    const draftStamp = draftList?.updated_at || '';
    const remoteStamp = remote.updated_at || '';
    if (draft?.dirty && draftList && (!remoteStamp || draftStamp >= remoteStamp)) {
      state.watchlist = draftList;
      state.draftDirty = true;
    } else {
      state.watchlist = remote;
      state.draftDirty = false;
      saveDraft();
    }
  }

  function bindPage() {
    $('focus-save')?.addEventListener('click', handleSave);
    $('focus-settings-btn')?.addEventListener('click', () => openSettings());
    $('focus-token-save')?.addEventListener('click', () => {
      const value = ($('focus-token')?.value || '').trim();
      if (!value) {
        setStatus('请先粘贴令牌，再点保存令牌。', 'error');
        return;
      }
      setToken(value);
      if ($('focus-token')) $('focus-token').value = '';
      refreshTokenState();
      setStatus('令牌已保存在这台浏览器里，与交割单分析页共用。现在可以点保存名单。', 'ok');
    });
    $('focus-token-clear')?.addEventListener('click', () => {
      setToken('');
      if ($('focus-token')) $('focus-token').value = '';
      refreshTokenState();
      setStatus('已清除这台浏览器里的令牌。');
    });
    $('focus-add-form')?.addEventListener('submit', addAsset);
    const dateInput = $('focus-date');
    if (dateInput) {
      dateInput.value = state.date;
      dateInput.addEventListener('change', () => {
        const value = dateInput.value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
        state.date = value;
        loadDetail();
      });
    }
    window.addEventListener('hashchange', () => {
      const id = hashId();
      const match = assets().find(item => item.id === id);
      if (match && match.id !== state.selectedId) {
        setSelected(match.id, false);
        renderPills();
        loadDetail();
      }
    });
  }

  async function start() {
    refreshTokenState();
    bindPage();
    await loadWatchlist();
    const fromHash = hashId();
    const match = assets().find(item => item.id === fromHash);
    setSelected(match?.id || assets()[0]?.id || '', true);
    renderPills();
    await loadDetail();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
