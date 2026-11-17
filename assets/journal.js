'use strict';
(() => {
  if (document.body?.dataset.page !== 'journal') return;

  const $ = id => document.getElementById(id);
  const REPO = 'Brian-yyds/morning-report';
  const API = 'https://api.github.com';
  const TOKEN_KEY = 'morning-report:trade-journal:token';
  const DRAFT_KEY = 'morning-report:trade-journal:draft:v1';
  const SCHEMA = 'trade-journal/v1';
  const FIELDS = [
    {key: 'long', label: '多单分析'},
    {key: 'short', label: '空单分析'},
    {key: 'structure', label: '结构分析'},
    {key: 'pattern', label: '形态分析'},
    {key: 'macro', label: '宏观分析'},
    {key: 'micro', label: '微观分析'},
    {key: 'liquidity', label: '流动性分析'},
    {key: 'market_maker', label: '做市商意图分析'},
  ];
  const ASSESS_LABEL = {
    sound: '站得住',
    biased: '有失偏颇',
    inaccurate: '失真',
    needs_context: '需要补充上下文',
  };
  const SOURCE_LABEL = {news: '新闻', twitter: '推特', market: '市场数据', other: '其他'};

  const state = {
    index: emptyIndex(),
    days: {},
    localImages: {},
    statusTimer: 0,
    saving: false,
    focusedEntry: '',
  };

  function emptyIndex() {
    return {schema: SCHEMA, updated_at: '', sample: false, days: []};
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
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(d);
    } catch {
      return String(value);
    }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function newId(date) {
    const stamp = String(date || todayStamp()).replace(/-/g, '');
    const rand = (crypto.randomUUID && crypto.randomUUID() || `${Date.now()}${Math.random()}`).replace(/-/g, '').slice(0, 10);
    return `tj-${stamp}-${rand}`;
  }

  function emptyAnalysis() {
    return Object.fromEntries(FIELDS.map(field => [field.key, '']));
  }

  function emptyReview() {
    return {status: 'pending', author: '', reviewed_at: null, summary: '', points: []};
  }

  function newEntry(date) {
    const stamp = nowISO();
    return {
      id: newId(date),
      created_at: stamp,
      updated_at: stamp,
      symbol: '',
      timeframe: '',
      image: {path: '', alt: 'K线图'},
      analysis: emptyAnalysis(),
      review: emptyReview(),
    };
  }

  function emptyDay(date) {
    return {
      schema: SCHEMA,
      date,
      updated_at: nowISO(),
      sample: false,
      entries: [newEntry(date)],
    };
  }

  function normalizeEntry(raw, date) {
    const entry = raw && typeof raw === 'object' ? raw : newEntry(date);
    const analysis = entry.analysis && typeof entry.analysis === 'object' ? entry.analysis : {};
    const image = entry.image && typeof entry.image === 'object' ? entry.image : {};
    const review = entry.review && typeof entry.review === 'object' ? entry.review : emptyReview();
    const points = Array.isArray(review.points) ? review.points : [];
    return {
      id: String(entry.id || newId(date)),
      created_at: entry.created_at || nowISO(),
      updated_at: entry.updated_at || entry.created_at || nowISO(),
      symbol: typeof entry.symbol === 'string' ? entry.symbol : '',
      timeframe: typeof entry.timeframe === 'string' ? entry.timeframe : '',
      image: {
        path: typeof image.path === 'string' ? image.path : '',
        alt: typeof image.alt === 'string' && image.alt ? image.alt : 'K线图',
      },
      analysis: Object.fromEntries(FIELDS.map(field => [field.key, typeof analysis[field.key] === 'string' ? analysis[field.key] : ''])),
      review: {
        status: review.status === 'done' ? 'done' : 'pending',
        author: typeof review.author === 'string' ? review.author : '',
        reviewed_at: review.reviewed_at || null,
        summary: typeof review.summary === 'string' ? review.summary : '',
        points: points.filter(point => point && typeof point === 'object').map(point => ({
          claim: typeof point.claim === 'string' ? point.claim : '',
          assessment: ['sound', 'biased', 'inaccurate', 'needs_context'].includes(point.assessment) ? point.assessment : 'needs_context',
          evidence: typeof point.evidence === 'string' ? point.evidence : '',
          sources: Array.isArray(point.sources) ? point.sources.filter(src => src && typeof src === 'object').map(src => ({
            type: typeof src.type === 'string' ? src.type : 'other',
            title: typeof src.title === 'string' ? src.title : '',
            url: typeof src.url === 'string' ? src.url : '',
            note: typeof src.note === 'string' ? src.note : '',
          })) : [],
        })),
      },
    };
  }

  function normalizeDay(raw, date) {
    const data = raw && typeof raw === 'object' ? raw : emptyDay(date);
    const entries = Array.isArray(data.entries) ? data.entries.map(item => normalizeEntry(item, date)) : [];
    return {
      schema: SCHEMA,
      date,
      updated_at: data.updated_at || nowISO(),
      sample: false,
      entries: entries.length ? entries : [newEntry(date)],
    };
  }

  function ensureToday() {
    const today = todayStamp();
    if (!state.days[today]) state.days[today] = emptyDay(today);
    if (!state.days[today].entries.length) state.days[today].entries.push(newEntry(today));
    return today;
  }

  function analysisHasText(entry) {
    return FIELDS.some(field => (entry.analysis?.[field.key] || '').trim());
  }

  function entryFingerprint(entry) {
    return JSON.stringify({
      symbol: entry.symbol || '',
      timeframe: entry.timeframe || '',
      image: entry.image?.path || '',
      analysis: entry.analysis || {},
    });
  }

  function getToken() {
    try {
      return String(localStorage.getItem(TOKEN_KEY) || '');
    } catch {
      return '';
    }
  }

  function setToken(value) {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      setStatus('无法把令牌写到本机浏览器存储。', 'error');
    }
  }

  function loadDraft() {
    try {
      const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      return raw && typeof raw === 'object' ? raw : null;
    } catch {
      return null;
    }
  }

  function saveDraft() {
    const payload = {
      saved_at: nowISO(),
      days: {},
      images: {},
    };
    Object.entries(state.days).forEach(([date, day]) => {
      payload.days[date] = {
        date,
        updated_at: day.updated_at,
        entries: day.entries.map(entry => ({
          ...entry,
          image: {...(entry.image || {})},
        })),
      };
    });
    Object.entries(state.localImages).forEach(([id, info]) => {
      if (info?.dataUrl) payload.images[id] = {dataUrl: info.dataUrl, name: info.name || '', type: info.type || 'image/webp'};
    });
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch {
      try {
        const slim = {...payload, images: {}};
        Object.entries(payload.images).forEach(([id, info]) => {
          if (info?.dataUrl && info.dataUrl.length < 800000) slim.images[id] = info;
        });
        localStorage.setItem(DRAFT_KEY, JSON.stringify(slim));
        setStatus('草稿已保存，但部分较大的图片可能没有全部写入本机缓存。', 'warn');
      } catch {
        setStatus('本机草稿空间不足，文字可能不会在刷新后全部保留。点保存以写入网站。', 'warn');
      }
    }
  }

  function applyDraft(draft) {
    if (!draft) return;
    const days = draft.days && typeof draft.days === 'object' ? draft.days : {};
    Object.entries(days).forEach(([date, raw]) => {
      const draftDay = normalizeDay(raw, date);
      const published = state.days[date];
      if (!published) {
        state.days[date] = draftDay;
        return;
      }
      const byId = new Map(published.entries.map(entry => [entry.id, entry]));
      const merged = [];
      const seen = new Set();
      draftDay.entries.forEach(entry => {
        const current = byId.get(entry.id);
        if (!current) {
          merged.push(entry);
          return;
        }
        seen.add(entry.id);
        const next = {
          ...current,
          symbol: entry.symbol,
          timeframe: entry.timeframe,
          analysis: entry.analysis,
          image: entry.image,
          updated_at: entry.updated_at || current.updated_at,
        };
        if (entryFingerprint(next) !== entryFingerprint(current)) {
          next.review = {...(current.review || emptyReview()), status: 'pending'};
        } else {
          next.review = current.review || emptyReview();
        }
        merged.push(next);
      });
      published.entries.forEach(entry => {
        if (!seen.has(entry.id)) merged.push(entry);
      });
      published.entries = merged.length ? merged : published.entries;
      published.updated_at = draftDay.updated_at || published.updated_at;
    });
    const images = draft.images && typeof draft.images === 'object' ? draft.images : {};
    Object.entries(images).forEach(([id, info]) => {
      if (!info?.dataUrl) return;
      state.localImages[id] = {dataUrl: info.dataUrl, name: info.name || '', type: info.type || 'image/webp', blob: null};
    });
  }

  function setStatus(message, kind) {
    const node = $('journal-status');
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

  function dataPath(rel) {
    return `data/trade-journal/${rel}`;
  }

  async function fetchJson(url) {
    const response = await fetch(url, {cache: 'no-store'});
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`读取 ${url} 失败（${response.status}）`);
    return response.json();
  }

  async function loadPublished() {
    const bust = `t=${Date.now()}`;
    let index = null;
    try {
      index = await fetchJson(`${dataPath('index.json')}?${bust}`);
    } catch {
      index = null;
    }
    state.index = index && typeof index === 'object' ? {
      schema: SCHEMA,
      updated_at: index.updated_at || '',
      sample: false,
      days: Array.isArray(index.days) ? index.days : [],
    } : emptyIndex();
    state.days = {};
    const dates = new Set(state.index.days.map(item => item && item.date).filter(Boolean));
    dates.add(todayStamp());
    await Promise.all([...dates].map(async date => {
      try {
        const data = await fetchJson(`${dataPath(`${date}/day.json`)}?${bust}`);
        if (data) state.days[date] = normalizeDay(data, date);
      } catch {
        /* 缺文件时按空处理 */
      }
    }));
  }

  function imageSrc(entry) {
    const local = state.localImages[entry.id];
    if (local?.dataUrl) return local.dataUrl;
    if (entry.image?.path) return entry.image.path;
    return '';
  }

  function readCard(article) {
    const date = article.dataset.date;
    const id = article.dataset.entryId;
    const day = state.days[date];
    if (!day) return null;
    const entry = day.entries.find(item => item.id === id);
    if (!entry) return null;
    const previous = entryFingerprint(entry);
    entry.symbol = article.querySelector('[data-field="symbol"]')?.value || '';
    entry.timeframe = article.querySelector('[data-field="timeframe"]')?.value || '';
    FIELDS.forEach(field => {
      entry.analysis[field.key] = article.querySelector(`[data-field="${field.key}"]`)?.value || '';
    });
    if (entryFingerprint(entry) !== previous) {
      entry.updated_at = nowISO();
      if (entry.review?.status === 'done') entry.review.status = 'pending';
      day.updated_at = entry.updated_at;
    }
    return entry;
  }

  function readAllCards() {
    document.querySelectorAll('.journal-card').forEach(readCard);
  }

  function dayMeta(date, day) {
    const pending = (day.entries || []).filter(entry => entry.review?.status !== 'done').length;
    return {
      date,
      entry_count: (day.entries || []).length,
      pending_review: pending,
      updated_at: day.updated_at || '',
    };
  }

  function rebuildIndex() {
    const dates = Object.keys(state.days).sort().reverse();
    const days = dates.map(date => dayMeta(date, state.days[date]));
    const updated = days.reduce((max, item) => item.updated_at > max ? item.updated_at : max, '');
    state.index = {schema: SCHEMA, updated_at: updated, sample: false, days};
    return state.index;
  }

  function bindAutoSave(root) {
    const persist = () => {
      readAllCards();
      saveDraft();
    };
    root.addEventListener('input', persist);
    root.addEventListener('change', persist);
  }

  function renderReview(entry) {
    const box = element('section', 'journal-review');
    box.append(element('h4', '', '行情分析核对'));
    const review = entry.review || emptyReview();
    if (review.status !== 'done') {
      box.append(element('p', 'journal-review-pending', '待核对'));
      return box;
    }
    const head = element('p', 'journal-review-head');
    head.append(element('span', '', review.author || '行情分析'));
    if (review.reviewed_at) head.append(element('span', 'muted', ` · ${formatDateTime(review.reviewed_at)} 北京时间`));
    box.append(head);
    if (review.summary) box.append(element('p', 'journal-review-summary', review.summary));
    const points = review.points || [];
    if (points.length) {
      const list = element('ul', 'journal-review-points');
      points.forEach(point => {
        const li = element('li');
        const badge = element('span', `wb-badge journal-assess journal-assess-${point.assessment}`, ASSESS_LABEL[point.assessment] || point.assessment);
        if (point.claim) li.append(element('p', 'journal-claim', point.claim));
        li.append(badge);
        if (point.evidence) li.append(element('p', 'journal-evidence', point.evidence));
        const sources = point.sources || [];
        if (sources.length) {
          const srcList = element('ul', 'journal-sources');
          sources.forEach(src => {
            const item = element('li');
            const label = SOURCE_LABEL[src.type] || src.type || '来源';
            const title = src.title || src.url || src.note || '';
            if (src.url && /^https?:\/\//i.test(src.url)) {
              const a = element('a', '', `${label}：${title || src.url}`);
              a.href = src.url;
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
              item.append(a);
            } else {
              item.append(element('span', '', `${label}：${title || '—'}`));
            }
            if (src.note && src.title) item.append(element('span', 'muted', ` · ${src.note}`));
            srcList.append(item);
          });
          li.append(srcList);
        }
        list.append(li);
      });
      box.append(list);
    }
    return box;
  }

  function renderCard(date, entry, options) {
    const article = element('article', 'journal-card wb-item');
    article.dataset.date = date;
    article.dataset.entryId = entry.id;
    article.addEventListener('focusin', () => { state.focusedEntry = entry.id; });
    article.addEventListener('click', () => { state.focusedEntry = entry.id; });

    const head = element('div', 'journal-card-head');
    head.append(element('h3', 'wb-item-title', options?.title || 'K线分析'));
    if (options?.canRemove) {
      const remove = element('button', 'journal-btn journal-btn-quiet', '移除这张');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        readAllCards();
        const day = state.days[date];
        if (!day || day.entries.length <= 1) return;
        day.entries = day.entries.filter(item => item.id !== entry.id);
        delete state.localImages[entry.id];
        day.updated_at = nowISO();
        saveDraft();
        render();
      });
      head.append(remove);
    }
    article.append(head);

    const media = element('div', 'journal-media');
    const drop = element('label', 'journal-drop');
    const src = imageSrc(entry);
    if (src) {
      const img = element('img', 'journal-image');
      img.src = src;
      img.alt = entry.image?.alt || 'K线图';
      drop.append(img);
    } else {
      drop.append(element('p', 'journal-drop-hint', '把K线图粘贴到这里，或点击选择文件。也可用 Ctrl / Cmd + V。'));
    }
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.className = 'sr-only';
    file.addEventListener('change', async () => {
      const picked = file.files && file.files[0];
      file.value = '';
      if (picked) await attachImage(date, entry.id, picked);
    });
    drop.append(file);
    drop.addEventListener('dragover', event => {
      event.preventDefault();
      drop.classList.add('is-over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', async event => {
      event.preventDefault();
      drop.classList.remove('is-over');
      const picked = event.dataTransfer?.files && event.dataTransfer.files[0];
      if (picked && picked.type.startsWith('image/')) await attachImage(date, entry.id, picked);
    });
    media.append(drop);
    if (src) {
      const clear = element('button', 'journal-btn journal-btn-quiet', '清除图片');
      clear.type = 'button';
      clear.addEventListener('click', () => {
        delete state.localImages[entry.id];
        entry.image = {path: '', alt: 'K线图'};
        entry.updated_at = nowISO();
        state.days[date].updated_at = entry.updated_at;
        saveDraft();
        render();
      });
      media.append(clear);
    }
    article.append(media);

    const meta = element('div', 'journal-meta');
    const symbol = document.createElement('input');
    symbol.type = 'text';
    symbol.dataset.field = 'symbol';
    symbol.value = entry.symbol || '';
    symbol.placeholder = '品种，选填';
    symbol.setAttribute('aria-label', '品种');
    const timeframe = document.createElement('input');
    timeframe.type = 'text';
    timeframe.dataset.field = 'timeframe';
    timeframe.value = entry.timeframe || '';
    timeframe.placeholder = '周期，选填';
    timeframe.setAttribute('aria-label', '周期');
    meta.append(symbol, timeframe);
    article.append(meta);

    const grid = element('div', 'journal-fields');
    FIELDS.forEach(field => {
      const wrap = element('label', 'journal-field');
      wrap.append(element('span', '', field.label));
      const area = document.createElement('textarea');
      area.dataset.field = field.key;
      area.rows = 6;
      area.value = entry.analysis?.[field.key] || '';
      area.placeholder = '在这里写';
      wrap.append(area);
      grid.append(wrap);
    });
    article.append(grid);
    article.append(renderReview(entry));
    return article;
  }

  function renderDay(date, day, isToday) {
    const section = element('section', 'journal-day');
    const heading = element('header', 'journal-day-head');
    heading.append(element('h3', '', isToday ? `今天 · ${formatDate(date)}` : formatDate(date)));
    heading.append(element('p', 'wb-meta', `${day.entries.length} 张K线`));
    section.append(heading);
    const stack = element('div', 'wb-stack journal-stack');
    day.entries.forEach((entry, index) => {
      stack.append(renderCard(date, entry, {
        title: day.entries.length > 1 ? `第 ${index + 1} 张` : 'K线分析',
        canRemove: isToday && day.entries.length > 1,
      }));
    });
    section.append(stack);
    return section;
  }

  function render() {
    const root = $('journal-root');
    if (!root) return;
    readAllCards();
    const today = ensureToday();
    const dates = Object.keys(state.days).sort().reverse();
    root.replaceChildren();
    dates.forEach(date => {
      const day = state.days[date];
      if (!day) return;
      if (date !== today && !(day.entries || []).length) return;
      root.append(renderDay(date, day, date === today));
    });
    bindAutoSave(root);
    refreshTokenState();
  }

  async function blobFromDataUrl(dataUrl, type) {
    const response = await fetch(dataUrl);
    return response.blob().then(blob => new Blob([blob], {type: type || blob.type || 'image/webp'}));
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(resolve => canvas.toBlob(resolve, type, quality));
  }

  async function compressImage(file) {
    let bitmap = null;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      bitmap = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
          URL.revokeObjectURL(url);
          resolve(image);
        };
        image.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('无法读取图片'));
        };
        image.src = url;
      });
    }
    const maxEdge = 1920;
    let width = bitmap.width || bitmap.naturalWidth;
    let height = bitmap.height || bitmap.naturalHeight;
    const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', {alpha: false});
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    if (bitmap.close) bitmap.close();

    let quality = 0.82;
    let blob = await canvasToBlob(canvas, 'image/webp', quality);
    if (!blob || !blob.size) blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    while (blob && blob.size > 450000 && quality > 0.5) {
      quality -= 0.12;
      const type = blob.type || 'image/webp';
      const next = await canvasToBlob(canvas, type, quality);
      if (next && next.size) blob = next;
      else break;
    }
    if (!blob) throw new Error('图片压缩失败');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('无法读取压缩后的图片'));
      reader.readAsDataURL(blob);
    });
    return {blob, dataUrl, type: blob.type || 'image/webp', name: file.name || ''};
  }

  async function attachImage(date, entryId, file) {
    try {
      setStatus('正在处理图片…');
      const compressed = await compressImage(file);
      const day = state.days[date];
      const entry = day?.entries.find(item => item.id === entryId);
      if (!entry) return;
      state.localImages[entryId] = compressed;
      entry.image = {path: entry.image?.path || '', alt: 'K线图'};
      entry.updated_at = nowISO();
      day.updated_at = entry.updated_at;
      saveDraft();
      render();
      setStatus('图片已附上，点保存才会发布到网站。');
    } catch (error) {
      setStatus(error.message || '图片处理失败。', 'error');
    }
  }

  function imageFromClipboard(event) {
    const items = event.clipboardData && event.clipboardData.items;
    if (!items) return null;
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) return item.getAsFile();
    }
    return null;
  }

  function findEntryTarget(start) {
    const card = start?.closest?.('.journal-card');
    if (card) return {date: card.dataset.date, id: card.dataset.entryId};
    if (state.focusedEntry) {
      for (const [date, day] of Object.entries(state.days)) {
        if (day.entries.some(entry => entry.id === state.focusedEntry)) {
          return {date, id: state.focusedEntry};
        }
      }
    }
    const today = ensureToday();
    const empty = state.days[today].entries.find(entry => !imageSrc(entry)) || state.days[today].entries[0];
    return empty ? {date: today, id: empty.id} : null;
  }

  function extensionFor(type) {
    if (type === 'image/jpeg') return 'jpg';
    return 'webp';
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

  async function blobToBase64(blob) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
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
      const content = typeof file.content === 'string' ? utf8ToBase64(file.content) : await blobToBase64(file.content);
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

  function decodeGithubContent(content) {
    const binary = atob(String(content || '').replace(/\n/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  async function fetchRepoJson(token, path) {
    try {
      const data = await api(token, 'GET', `/repos/${REPO}/contents/${path}`);
      if (!data?.content) return null;
      return JSON.parse(decodeGithubContent(data.content));
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  function mergeRemoteDay(localDay, remoteRaw, date) {
    if (!remoteRaw) return normalizeDay(localDay, date);
    const remote = normalizeDay(remoteRaw, date);
    const localById = new Map((localDay.entries || []).map(entry => [entry.id, entry]));
    const used = new Set();
    const merged = [];
    (localDay.entries || []).forEach(entry => {
      const remoteEntry = remote.entries.find(item => item.id === entry.id);
      used.add(entry.id);
      if (!remoteEntry) {
        merged.push(entry);
        return;
      }
      const next = {...entry};
      if (entryFingerprint(entry) === entryFingerprint(remoteEntry)) {
        next.review = remoteEntry.review || entry.review;
      } else if (entry.review?.status !== 'done' && remoteEntry.review?.status === 'done' && entryFingerprint({...entry, analysis: remoteEntry.analysis, symbol: remoteEntry.symbol, timeframe: remoteEntry.timeframe, image: remoteEntry.image}) === entryFingerprint(remoteEntry)) {
        next.review = remoteEntry.review;
      }
      merged.push(next);
    });
    remote.entries.forEach(entry => {
      if (!used.has(entry.id) && !localById.has(entry.id)) merged.push(entry);
    });
    return {
      ...normalizeDay({...localDay, entries: merged}, date),
      updated_at: (remote.updated_at || '') > (localDay.updated_at || '') && entryFingerprintsEqual(localDay, remote) ? remote.updated_at : (localDay.updated_at || remote.updated_at || nowISO()),
    };
  }

  function entryFingerprintsEqual(a, b) {
    const left = (a.entries || []).map(entryFingerprint).join('|');
    const right = (b.entries || []).map(entryFingerprint).join('|');
    return left === right;
  }

  async function mergeRemoteJournal(token) {
    const remoteIndex = await fetchRepoJson(token, dataPath('index.json'));
    const dates = new Set([
      ...Object.keys(state.days),
      ...((remoteIndex && remoteIndex.days) || []).map(item => item && item.date).filter(Boolean),
    ]);
    for (const date of dates) {
      const remoteDay = await fetchRepoJson(token, dataPath(`${date}/day.json`));
      if (!state.days[date] && remoteDay) {
        state.days[date] = normalizeDay(remoteDay, date);
        continue;
      }
      if (state.days[date]) state.days[date] = mergeRemoteDay(state.days[date], remoteDay, date);
    }
  }

  async function prepareFiles() {
    readAllCards();
    const today = ensureToday();
    const files = [];
    for (const [date, day] of Object.entries(state.days)) {
      const prepared = normalizeDay(day, date);
      for (const entry of prepared.entries) {
        const local = state.localImages[entry.id];
        if (local) {
          if (!local.blob && local.dataUrl) local.blob = await blobFromDataUrl(local.dataUrl, local.type);
          const ext = extensionFor(local.blob?.type || local.type);
          const path = dataPath(`${date}/${entry.id}.${ext}`);
          entry.image = {path, alt: 'K线图'};
          files.push({path, content: local.blob});
        }
      }
      prepared.updated_at = prepared.updated_at || nowISO();
      prepared.sample = false;
      state.days[date] = prepared;
      files.push({
        path: dataPath(`${date}/day.json`),
        content: JSON.stringify(prepared, null, 2) + '\n',
      });
    }
    const index = rebuildIndex();
    files.push({
      path: dataPath('index.json'),
      content: JSON.stringify(index, null, 2) + '\n',
    });
    return {files, today};
  }

  async function handleSave() {
    if (state.saving) return;
    readAllCards();
    saveDraft();
    const token = getToken();
    if (!token) {
      openSettings(true);
      setStatus('还没有设置 GitHub 令牌。文字和图片已先存在本机草稿里；设置令牌后再点保存，才会发布到网站。', 'error');
      return;
    }
    state.saving = true;
    $('journal-save').disabled = true;
    setStatus('正在保存到网站…');
    try {
      await mergeRemoteJournal(token);
      const {files, today} = await prepareFiles();
      await githubCommit(token, files, `交割单分析 ${today}`);
      Object.keys(state.localImages).forEach(id => {
        const path = Object.values(state.days).flatMap(day => day.entries).find(entry => entry.id === id)?.image?.path;
        if (path) delete state.localImages[id];
      });
      saveDraft();
      render();
      setStatus('保存成功。记录已提交到网站仓库，公开页面通常几十秒到一分钟后能看到最新内容。', 'ok');
    } catch (error) {
      const hint = error.status === 401 || error.status === 403
        ? '令牌无效，或没有对 Brian-yyds/morning-report 的 Contents 写权限。请在设置里更换令牌。'
        : error.status === 409
          ? '仓库刚刚有了新的提交，请再点一次保存。'
          : (error.message || '保存失败。');
      setStatus(`保存失败：${hint}`, 'error');
    } finally {
      state.saving = false;
      $('journal-save').disabled = false;
    }
  }

  function refreshTokenState() {
    const node = $('journal-token-state');
    if (!node) return;
    node.textContent = getToken() ? '这台浏览器里已经保存了令牌。' : '还没有令牌。没有令牌时可以先打字、贴图，内容会留在本机草稿里。';
  }

  function openSettings(open) {
    const panel = $('journal-settings');
    const button = $('journal-settings-btn');
    if (!panel || !button) return;
    const hide = open === undefined ? !panel.hidden : !open;
    panel.hidden = hide;
    button.setAttribute('aria-expanded', String(!hide));
    if (!hide) {
      const input = $('journal-token');
      if (input) {
        input.value = '';
        input.focus();
      }
    }
    refreshTokenState();
  }

  function addEntry() {
    readAllCards();
    const today = ensureToday();
    const entry = newEntry(today);
    state.days[today].entries.push(entry);
    state.days[today].updated_at = entry.updated_at;
    state.focusedEntry = entry.id;
    saveDraft();
    render();
    const card = document.querySelector(`.journal-card[data-entry-id="${entry.id}"]`);
    card?.scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  function bindPage() {
    $('journal-save')?.addEventListener('click', handleSave);
    $('journal-add')?.addEventListener('click', addEntry);
    $('journal-settings-btn')?.addEventListener('click', () => openSettings());
    $('journal-token-save')?.addEventListener('click', () => {
      const value = ($('journal-token')?.value || '').trim();
      if (!value) {
        setStatus('请先粘贴令牌，再点保存令牌。', 'error');
        return;
      }
      setToken(value);
      if ($('journal-token')) $('journal-token').value = '';
      refreshTokenState();
      setStatus('令牌已保存在这台浏览器里。现在可以点保存，把记录发布到网站。', 'ok');
    });
    $('journal-token-clear')?.addEventListener('click', () => {
      setToken('');
      if ($('journal-token')) $('journal-token').value = '';
      refreshTokenState();
      setStatus('已清除这台浏览器里的令牌。');
    });
    document.addEventListener('paste', async event => {
      const file = imageFromClipboard(event);
      if (!file) return;
      const target = event.target;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') && !file) return;
      const dest = findEntryTarget(target);
      if (!dest) return;
      event.preventDefault();
      await attachImage(dest.date, dest.id, file);
    });
  }

  async function start() {
    bindPage();
    refreshTokenState();
    setStatus('正在读取已保存的记录…');
    try {
      await loadPublished();
    } catch {
      /* 本地直接打开文件时可能读不到，按空记录继续 */
    }
    applyDraft(loadDraft());
    ensureToday();
    render();
    const updated = state.index.updated_at;
    setStatus(updated ? `已加载记录，最近保存于 ${formatDateTime(updated)} 北京时间。` : '今天可以从一张空白分析开始。打字和贴图会先留在本机草稿里。');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
