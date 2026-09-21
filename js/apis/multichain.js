/* ============================================================
   multichain.js — Polygon, Avalanche via their block explorers
   ============================================================ */

window.CF = window.CF || {};

CF.MultichainAPI = (() => {
  const CHAINS = {
    polygon: {
      base:        CF.POLYGONSCAN_API,
      settingsKey: 'polygonscanKey',
      native:      { symbol: 'POL', name: 'Polygon', coingeckoId: 'matic-network', decimals: 18 },
    },
    avalanche: {
      base:        CF.SNOWTRACE_API,
      settingsKey: 'snowtraceKey',
      native:      { symbol: 'AVAX', name: 'Avalanche', coingeckoId: 'avalanche-2', decimals: 18 },
    },
  };

  function buildUrl(base, params, apiKey) {
    const qs = new URLSearchParams({ ...params, apikey: apiKey || 'YourApiKeyToken' });
    return `${base}?${qs}`;
  }

  async function getNativeBalance(address, chain, apiKey) {
    const url  = buildUrl(chain.base, { module: 'account', action: 'balance', address, tag: 'latest' }, apiKey);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.status !== '1') throw new Error(data.message);
    return parseInt(data.result) / Math.pow(10, chain.native.decimals);
  }

  async function fetchHoldings(source) {
    const chainKey = source.subtype || source.network;
    const chain    = CHAINS[chainKey];
    if (!chain) throw new Error(`Unsupported chain: ${chainKey}`);

    const settings = CF.Storage.getSettings();
    const apiKey   = settings[chain.settingsKey] || '';

    const balance = await getNativeBalance(source.address, chain, apiKey);
    if (balance <= 0) return [];

    return [{
      coingeckoId: chain.native.coingeckoId,
      symbol:      chain.native.symbol,
      name:        chain.native.name,
      balance,
      valueUSD:    null,
    }];
  }

  return { fetchHoldings };
})();
