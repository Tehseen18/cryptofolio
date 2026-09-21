/* ============================================================
   injective.js — INJ, ATOM, OSMO via Cosmos LCD APIs
   No API key required, CORS supported
   ============================================================ */

window.CF = window.CF || {};

CF.InjectiveAPI = (() => {
  const LCD_ENDPOINTS = {
    injective: { base: CF.INJECTIVE_LCD, denom: 'inj',   decimals: 18, coingeckoId: 'injective-protocol', symbol: 'INJ', name: 'Injective' },
    cosmos:    { base: CF.COSMOS_LCD,    denom: 'uatom',  decimals: 6,  coingeckoId: 'cosmos',             symbol: 'ATOM', name: 'Cosmos' },
    osmosis:   { base: CF.OSMOSIS_LCD,   denom: 'uosmo',  decimals: 6,  coingeckoId: 'osmosis',            symbol: 'OSMO', name: 'Osmosis' },
  };

  /**
   * Fetch native token balance for a Cosmos-based address
   */
  async function getBalance(address, chainKey) {
    const chain = LCD_ENDPOINTS[chainKey];
    if (!chain) throw new Error(`Unknown chain: ${chainKey}`);

    const url  = `${chain.base}/cosmos/bank/v1beta1/balances/${address}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    const balances = data.balances || [];
    const native   = balances.find(b => b.denom === chain.denom);
    if (!native) return 0;

    return parseInt(native.amount) / Math.pow(10, chain.decimals);
  }

  /**
   * Aggregate holdings for an Injective / Cosmos source
   */
  async function fetchHoldings(source) {
    const chainKey = source.subtype || source.network || 'injective';
    const chain    = LCD_ENDPOINTS[chainKey];
    if (!chain) throw new Error(`Unsupported chain: ${chainKey}`);

    const balance = await getBalance(source.address, chainKey);
    if (balance === 0) return [];

    return [{
      coingeckoId: chain.coingeckoId,
      symbol:      chain.symbol,
      name:        chain.name,
      balance,
      valueUSD:    null,
    }];
  }

  return { getBalance, fetchHoldings };
})();
