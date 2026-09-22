/* ============================================================
   storage.js — localStorage wrapper (privacy-first)
   All data lives only in the user's browser.
   ============================================================ */

window.CF = window.CF || {};

CF.Storage = (() => {
  const KEYS = {
    SOURCES:   'cf_sources',
    SETTINGS:  'cf_settings',
    PRICES:    'cf_prices_cache',
    SNAPSHOTS: 'cf_snapshots',
    HOLDINGS:  'cf_holdings_cache',
    HIDDEN:    'cf_hidden_tokens',
  };

  const DEFAULT_SETTINGS = {
    currency:        'USD',
    refreshInterval: 60,
    etherscanKey:    '',
    bscscanKey:      '',
    polygonscanKey:  '',
    snowtraceKey:    '',
    proxyUrl:        'http://localhost:3131',
    hideSpam:        true,
  };

  // ── Generic helpers ────────────────────────────────────────

  function _get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('[Storage] Read error:', key, e);
      return fallback;
    }
  }

  function _set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('[Storage] Write error:', key, e);
    }
  }

  // ── Sources (wallets + exchanges) ──────────────────────────

  function getSources() {
    const list = _get(KEYS.SOURCES, []);
    let dirty = false;
    list.forEach(s => {
      if (Array.isArray(s.holdings)) {
        s.holdings.forEach(h => {
          const sym = (h.symbol || '').toUpperCase().trim();
          const isSol = (s.chain || '').toLowerCase().includes('solana') || (h.chain || '').toLowerCase().includes('solana');
          if ((sym === 'BABY' || h.name === 'Baby Samo Coin') && (isSol || h.contract === 'Uuc6hiKT9Y6ASoqs2phonGGw2LAtecfJu9yEohppzWH')) {
            h.coingeckoId = 'baby-samo-coin';
            if (typeof h.price === 'number' && h.price > 0.0001) {
              h.price = 0.000002005;
              h.valueUSD = (h.balance || 0) * h.price;
              dirty = true;
            }
          }
        });
      }
    });
    if (dirty) {
      _set(KEYS.SOURCES, list);
    }
    return list;
  }

  function getSourceById(id) {
    return getSources().find(s => s.id === id) || null;
  }

  function addSource(source) {
    const sources = getSources();
    const newSource = {
      ...source,
      id:        source.id || `src_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      syncedAt:  null,
      status:    'pending',
      holdings:  [],
    };
    sources.push(newSource);
    _set(KEYS.SOURCES, sources);
    return newSource;
  }

  function updateSource(id, patch) {
    const sources = getSources().map(s => s.id === id ? { ...s, ...patch } : s);
    _set(KEYS.SOURCES, sources);
  }

  function removeSource(id) {
    const sources = getSources().filter(s => s.id !== id);
    _set(KEYS.SOURCES, sources);
  }

  // ── Settings ───────────────────────────────────────────────

  function getSettings() {
    return { ...DEFAULT_SETTINGS, ..._get(KEYS.SETTINGS, {}) };
  }

  function saveSettings(patch) {
    const current = getSettings();
    _set(KEYS.SETTINGS, { ...current, ...patch });
  }

  // ── Price cache ────────────────────────────────────────────

  function getPriceCache() {
    const cache = _get(KEYS.PRICES, { data: {}, ts: 0 });
    if (cache && cache.data) {
      if (cache.data['BABY'] && cache.data['BABY'].usd > 0.0001) {
        delete cache.data['BABY'];
      }
      if (cache.data['baby'] && cache.data['baby'].usd > 0.0001) {
        delete cache.data['baby'];
      }
    }
    return cache;
  }

  function setPriceCache(data) {
    _set(KEYS.PRICES, { data, ts: Date.now() });
  }

  function isPriceCacheValid(maxAgeMs = 30_000) {
    const cache = getPriceCache();
    return Date.now() - cache.ts < maxAgeMs;
  }

  // ── Portfolio snapshots (for historical chart) ─────────────

  function getSnapshots() {
    return _get(KEYS.SNAPSHOTS, []);
  }

  function addSnapshot(totalUSD) {
    const snaps = getSnapshots();
    // Keep max 365 daily snapshots
    const today = new Date().toISOString().split('T')[0];
    const existsToday = snaps.find(s => s.date === today);
    if (existsToday) {
      existsToday.value = totalUSD;
    } else {
      snaps.push({ date: today, value: totalUSD });
      if (snaps.length > 365) snaps.shift();
    }
    _set(KEYS.SNAPSHOTS, snaps);
  }

  // ── Holdings cache ─────────────────────────────────────────

  function getHoldingsCache() {
    return _get(KEYS.HOLDINGS, {});
  }

  function setHoldingsCache(data) {
    _set(KEYS.HOLDINGS, data);
  }

  // ── Nuke everything ────────────────────────────────────────

  // ── Hidden / Spam Tokens ──────────────────────────────────

  function getHiddenTokens() {
    return _get(KEYS.HIDDEN, []);
  }

  function hideToken(tokenKey) {
    if (!tokenKey) return getHiddenTokens();
    const key = String(tokenKey).toUpperCase().trim();
    const list = getHiddenTokens();
    if (!list.includes(key)) {
      list.push(key);
      _set(KEYS.HIDDEN, list);
    }
    return list;
  }

  function unhideToken(tokenKey) {
    if (!tokenKey) return getHiddenTokens();
    const key = String(tokenKey).toUpperCase().trim();
    const list = getHiddenTokens().filter(k => k !== key);
    _set(KEYS.HIDDEN, list);
    return list;
  }

  function unhideAllTokens() {
    _set(KEYS.HIDDEN, []);
    return [];
  }

  // ── Nuke everything ────────────────────────────────────────

  function clearAll() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  }

  // ── Export / Import ────────────────────────────────────────

  function exportJSON() {
    const data = {
      exportedAt: new Date().toISOString(),
      version:    1,
      sources:    getSources().map(s => {
        // Redact secrets before export
        const safe = { ...s };
        if (safe.apiSecret) safe.apiSecret = '***REDACTED***';
        return safe;
      }),
      snapshots:  getSnapshots(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `cryptofolio-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    const sources = getSources();
    const rows    = [['Source', 'Network', 'Symbol', 'Balance', 'Value USD', 'Address']];
    sources.forEach(src => {
      (src.holdings || []).forEach(h => {
        rows.push([
          src.name,
          src.network || src.type,
          h.symbol,
          h.balance,
          h.valueUSD || '',
          src.address || src.apiKey || '',
        ]);
      });
    });
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `cryptofolio-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(rawStr) {
    try {
      const data = typeof rawStr === 'string' ? JSON.parse(rawStr) : rawStr;
      if (!data || !Array.isArray(data.sources)) {
        throw new Error('Invalid backup file format: missing sources');
      }

      const current = getSources();
      const existingIds = new Set(current.map(s => s.id));
      const existingAddresses = new Set(current.map(s => (s.address || '').toLowerCase()));

      let importedCount = 0;
      data.sources.forEach(src => {
        if (!src.id) src.id = 'src_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        // Avoid duplicate address/source if already present
        if (src.address && existingAddresses.has(src.address.toLowerCase())) {
          return;
        }
        current.push(src);
        importedCount++;
      });

      set(KEYS.SOURCES, current);

      if (Array.isArray(data.snapshots) && data.snapshots.length > 0) {
        set(KEYS.SNAPSHOTS, data.snapshots);
      }

      if (Array.isArray(data.hiddenTokens)) {
        set(KEYS.HIDDEN, data.hiddenTokens);
      }

      return { success: true, count: importedCount, total: current.length };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  return {
    getSources, getSourceById, addSource, updateSource, removeSource,
    getSettings, saveSettings,
    getPriceCache, setPriceCache, isPriceCacheValid,
    getSnapshots, addSnapshot,
    getHoldingsCache, setHoldingsCache,
    getHiddenTokens, hideToken, unhideToken, unhideAllTokens,
    clearAll, exportJSON, exportCSV, importJSON,
  };
})();
