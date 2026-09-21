/* ============================================================
   cosmosChains.js — Cosmos SDK Chains Engine (ATOM, OSMO, SEI)
   • Standard Cosmos Bank v1beta1 REST balances
   • High-availability public endpoints with automatic fallback
   • Real-time Binance ticker & CoinGecko prices
   ============================================================ */

window.CF = window.CF || {};

CF.CosmosChainsAPI = (() => {

  const CHAIN_CONFIGS = {
    cosmos: {
      name:        'Cosmos Hub',
      symbol:      'ATOM',
      coingeckoId: 'cosmos',
      nativeDenom: 'uatom',
      decimals:    6,
      endpoints:   [
        'https://cosmos-rest.publicnode.com',
        'https://rest.cosmos.directory/cosmoshub',
      ],
      prefix:      'cosmos',
      image:       'https://assets.coingecko.com/coins/images/1481/small/cosmos_hub.png',
    },
    osmosis: {
      name:        'Osmosis',
      symbol:      'OSMO',
      coingeckoId: 'osmosis',
      nativeDenom: 'uosmo',
      decimals:    6,
      endpoints:   [
        'https://osmosis-rest.publicnode.com',
        'https://rest.cosmos.directory/osmosis',
      ],
      prefix:      'osmo',
      image:       'https://assets.coingecko.com/coins/images/16724/small/osmosis.png',
    },
    sei: {
      name:        'Sei',
      symbol:      'SEI',
      coingeckoId: 'sei-network',
      nativeDenom: 'usei',
      decimals:    6,
      endpoints:   [
        'https://sei-rest.publicnode.com',
        'https://rest.cosmos.directory/sei',
      ],
      prefix:      'sei',
      image:       'https://assets.coingecko.com/coins/images/28205/small/Sei_Logo_-_Transparent.png',
    },
  };

  /**
   * Fetch balances for a Cosmos SDK chain address
   */
  async function fetchChainBalances(chainKey, address) {
    const config = CHAIN_CONFIGS[chainKey];
    if (!config) throw new Error(`Unsupported Cosmos chain: ${chainKey}`);

    let lastError = null;

    for (const base of config.endpoints) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 7000);
      try {
        const url = `${base}/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`;
        const resp = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          signal:  ctrl.signal,
        });
        clearTimeout(timer);

        if (!resp.ok) {
          lastError = new Error(`HTTP ${resp.status} on ${base}`);
          continue;
        }

        const data = await resp.json();
        return data.balances || [];
      } catch (e) {
        clearTimeout(timer);
        lastError = e;
      }
    }

    throw new Error(`Failed to query ${config.name} balance: ${lastError?.message || 'timeout'}`);
  }

  /**
   * Generic fetchHoldings handler called for cosmos, osmosis, or sei
   */
  async function fetchHoldings(source) {
    let address = (source.address || '').trim();
    address = address.replace(/^[a-z]+:/i, '').split('?')[0].trim();

    if (!address) {
      throw new Error('Please enter a valid wallet address');
    }

    // Determine chain key
    let chainKey = source.network || source.subtype || 'cosmos';
    if (!CHAIN_CONFIGS[chainKey]) {
      if (address.startsWith('osmo1')) chainKey = 'osmosis';
      else if (address.startsWith('sei1')) chainKey = 'sei';
      else if (address.startsWith('cosmos1')) chainKey = 'cosmos';
      else chainKey = 'cosmos';
    }

    const config = CHAIN_CONFIGS[chainKey];

    CF.Notify.info(`Scanning ${config.name} for ${address.slice(0, 10)}...`, 4000);

    const balances = await fetchChainBalances(chainKey, address);

    // Find native coin balance
    let nativeRaw = '0';
    balances.forEach(b => {
      if (b.denom === config.nativeDenom) {
        nativeRaw = b.amount;
      }
    });

    const nativeBalance = parseFloat(nativeRaw) / Math.pow(10, config.decimals);

    // Live price
    const priceCache = CF.Storage?.getPriceCache()?.data || {};
    let price  = priceCache[config.symbol]?.usd || priceCache[config.coingeckoId]?.usd || null;
    let change = priceCache[config.symbol]?.usd_24h_change ?? priceCache[config.coingeckoId]?.usd_24h_change ?? null;

    if (!price && CF.CoinGecko?.getPrice) {
      try {
        const live = await CF.CoinGecko.getPrice(config.coingeckoId);
        if (live?.usd) {
          price  = live.usd;
          change = live.usd_24h_change;
        }
      } catch (e) { /* skip */ }
    }

    const holdings = [{
      symbol:      config.symbol,
      name:        config.name,
      balance:     nativeBalance,
      decimals:    config.decimals,
      contract:    'native',
      chain:       config.name,
      chains:      [config.name],
      price:       price,
      change24h:   change,
      valueUSD:    price ? nativeBalance * price : null,
      image:       config.image,
      coingeckoId: config.coingeckoId,
      isCore:      true,
      isSpam:      false,
    }];

    console.info(`[CosmosChainsAPI] Fetched ${nativeBalance} ${config.symbol} on ${config.name} for ${address}`);
    return holdings;
  }

  return { fetchHoldings, CHAIN_CONFIGS };
})();
