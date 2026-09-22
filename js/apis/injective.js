/* ============================================================
   injective.js — Injective ($INJ), Cosmos ($ATOM), Osmosis ($OSMO)
   Multi-endpoint LCD fallback engine with automatic retry & pricing
   ============================================================ */

window.CF = window.CF || {};

CF.InjectiveAPI = (() => {

  const INJECTIVE_ENDPOINTS = [
    'https://lcd.injective.network',
    'https://sentry.lcd.injective.network',
    'https://injective-api.polkachu.com',
    'https://injective-rest.publicnode.com',
    'https://rest.cosmos.directory/injective',
  ];

  const COSMOS_ENDPOINTS = [
    'https://cosmos-rest.publicnode.com',
    'https://rest.cosmos.directory/cosmoshub',
    'https://lcd-cosmoshub.keplr.app',
  ];

  const OSMOSIS_ENDPOINTS = [
    'https://osmosis-rest.publicnode.com',
    'https://rest.cosmos.directory/osmosis',
    'https://lcd.osmosis.zone',
  ];

  const CHAIN_CONFIGS = {
    injective: {
      name:        'Injective',
      symbol:      'INJ',
      denom:       'inj',
      decimals:    18,
      coingeckoId: 'injective-protocol',
      endpoints:   INJECTIVE_ENDPOINTS,
      image:       'https://assets.coingecko.com/coins/images/12882/small/Secondary_Symbol.png',
      prefix:      'inj',
    },
    cosmos: {
      name:        'Cosmos Hub',
      symbol:      'ATOM',
      denom:       'uatom',
      decimals:    6,
      coingeckoId: 'cosmos',
      endpoints:   COSMOS_ENDPOINTS,
      image:       'https://assets.coingecko.com/coins/images/1481/small/cosmos_hub.png',
      prefix:      'cosmos',
    },
    osmosis: {
      name:        'Osmosis',
      symbol:      'OSMO',
      denom:       'uosmo',
      decimals:    6,
      coingeckoId: 'osmosis',
      endpoints:   OSMOSIS_ENDPOINTS,
      image:       'https://assets.coingecko.com/coins/images/16724/small/osmosis.png',
      prefix:      'osmo',
    },
  };

  /**
   * Fetch native balance across fallback endpoints
   */
  async function getBalance(address, chainKey) {
    const config = CHAIN_CONFIGS[chainKey] || CHAIN_CONFIGS.injective;
    let lastError = null;

    for (const base of config.endpoints) {
      try {
        const ctrl  = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        const url   = `${base}/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`;

        const resp = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          signal:  ctrl.signal,
        });
        clearTimeout(timer);

        if (!resp.ok) {
          lastError = new Error(`Endpoint ${base} HTTP ${resp.status}`);
          continue;
        }

        const data = await resp.json();
        const balances = data.balances || [];
        const native   = balances.find(b => b.denom === config.denom);

        if (!native) return 0;
        const rawAmount = parseFloat(native.amount) || 0;
        return rawAmount / Math.pow(10, config.decimals);

      } catch (e) {
        lastError = e;
      }
    }

    throw new Error(`Failed to fetch ${config.name} balance across public endpoints: ${lastError?.message || 'Network error'}`);
  }

  /**
   * Aggregate holdings for an Injective / Cosmos source
   */
  async function fetchHoldings(source) {
    let address = (source.address || '').trim();
    address = address.replace(/^injective:/i, '').split('?')[0].trim();

    if (!address) {
      throw new Error('Please enter a valid Injective address (inj1...)');
    }

    const chainKey = source.subtype || source.network || 'injective';
    const config   = CHAIN_CONFIGS[chainKey] || CHAIN_CONFIGS.injective;

    CF.Notify.info(`Querying ${config.name} blockchain for ${address.slice(0, 8)}...`, 3500);

    const balance = await getBalance(address, chainKey);

    // Look up cached or live price
    const priceCache = CF.Storage?.getPriceCache()?.data || {};
    let priceData    = priceCache[config.symbol] || priceCache[config.coingeckoId] || null;
    let price        = priceData?.usd || null;
    let change24h    = priceData?.usd_24h_change ?? null;

    // Fetch Binance ticker fallback if missing
    if (!price) {
      try {
        const bResp = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${config.symbol}USDT`);
        if (bResp.ok) {
          const bData = await bResp.json();
          price     = parseFloat(bData.lastPrice) || null;
          change24h = parseFloat(bData.priceChangePercent) || null;
        }
      } catch (e) { /* ignore */ }
    }

    const valueUSD = price != null ? balance * price : null;

    return [{
      coingeckoId: config.coingeckoId,
      symbol:      config.symbol,
      name:        config.name,
      balance,
      price,
      change24h,
      valueUSD,
      image:       config.image,
      chain:       config.name,
      chains:      [config.name],
      isCore:      true,
      isSpam:      false,
    }];
  }

  return { getBalance, fetchHoldings };
})();
