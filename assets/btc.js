(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'morning-report:trade:v1';
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
})();
