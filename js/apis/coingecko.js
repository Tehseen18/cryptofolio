/* ============================================================
   coingecko.js — Real-Time High-Frequency Price Engine
   Combines:
   1. Binance Live Ticker 24hr Feed (sub-second institutional CEX prices,
      real-time 24h change, covers 3,700+ pairs in ONE instant call)
   2. DexScreener Batch API (verified contract-based DEX liquidity pool prices)
   3. CoinGecko API (supplemental tokens, metadata, market caps)
   ============================================================ */

window.CF = window.CF || {};

CF.CoinGecko = (() => {
  const CG_BASE = CF.COINGECKO_API || 'https://api.coingecko.com/api/v3';

  // Common mapping between CoinGecko IDs and standard ticker symbols
  const COIN_TO_SYMBOL = {
    'ethereum':           'ETH',
    'binancecoin':        'BNB',
    'bitcoin':            'BTC',
    'solana':             'SOL',
    'injective-protocol': 'INJ',
    'cosmos':             'ATOM',
    'osmosis':            'OSMO',
    'matic-network':      'POL',
    'avalanche-2':        'AVAX',
    'arbitrum':           'ARB',
    'optimism':           'OP',
    'dogecoin':           'DOGE',
    'shiba-inu':          'SHIB',
    'pepe':               'PEPE',
    'chainlink':          'LINK',
    'uniswap':            'UNI',
    'aave':               'AAVE',
    'maker':              'MKR',
    'near':               'NEAR',
    'celestia':           'TIA',
    'pendle':             'PENDLE',
    'worldcoin-wld':      'WLD',
    'pancakeswap-token':  'CAKE',
    'aerodrome-finance':  'AERO',
    'velodrome-finance':  'VELODROME',
    'trust-wallet-token': 'TWT',
    'safepal':            'SFP',
    'scroll':             'SCR',
    'zksync':             'ZK',
    'jito-governance-token': 'JTO',
    'tensor':             'TNSR',
    'bonk':               'BONK',
    'dogwifcoin':         'WIF',
    'jupiter-exchange-solana': 'JUP',
    'pyth-network':       'PYTH',
    'book-of-meme':       'BOME',
    'pudgy-penguins':     'PENGU',
    'peanut-the-squirrel':'PNUT',
    'act-i-the-ai-prophecy': 'ACT',
    'magic-eden':         'ME',
    'blockstack':         'STX',
    'the-open-network':   'TON',
    'gram':               'GRAM',
    'sei-network':        'SEI',
    'aptos':              'APT',
    'internet-computer':  'ICP',
  };

  /**
   * Fetch all 3,700+ live tickers from Binance in a single call (~200ms)
   * Free, instant, CORS-open, sub-second execution prices + 24h changes
   */
  async function fetchLiveBinanceTickers() {
    const prices = {};
    try {
      const resp = await fetch('https://api.binance.com/api/v3/ticker/24hr', {
        headers: { 'Accept': 'application/json' },
      });
      if (!resp.ok) {
        console.warn(`[PriceEngine] Binance ticker returned status ${resp.status}`);
        return prices;
      }
      const data = await resp.json();
      if (!Array.isArray(data)) return prices;

      data.forEach(item => {
        if (item.symbol && item.symbol.endsWith('USDT')) {
          const sym = item.symbol.slice(0, -4);
          const usd = parseFloat(item.lastPrice);
          const chg = parseFloat(item.priceChangePercent);
          if (!isNaN(usd) && usd > 0) {
            const entry = {
              usd,
              usd_24h_change: isNaN(chg) ? null : chg,
              high24h:        parseFloat(item.highPrice) || null,
              low24h:         parseFloat(item.lowPrice) || null,
              volume24h:      parseFloat(item.quoteVolume) || null,
              source:         'binance',
            };
            prices[sym.toUpperCase()] = entry;
            prices[sym.toLowerCase()] = entry;
          }
        }
      });

      // Special alias: Velodrome Finance
      if (prices['VELODROME']) {
        prices['VELO'] = prices['VELODROME'];
        prices['VELO(V2)'] = prices['VELODROME'];
        prices['VELO(v2)'] = prices['VELODROME'];
        prices['velodrome-finance'] = prices['VELODROME'];
        prices['0x9560e827af36c94d2ac33a39bce1fe78631088db'] = prices['VELODROME'];
      }

      // Map canonical CoinGecko IDs to Binance live prices
      Object.entries(COIN_TO_SYMBOL).forEach(([cgId, sym]) => {
        if (prices[sym]) {
          prices[cgId] = prices[sym];
        }
      });

      console.info(`[PriceEngine] Loaded ${Object.keys(prices).length / 2} live Binance tickers`);
    } catch (e) {
      console.warn('[PriceEngine] Binance live ticker fetch failed:', e.message);
    }
    return prices;
  }

  /**
   * Fetch token prices in batch from DexScreener using comma-separated contract addresses
   */
  async function fetchDexScreenerBatch(contractAddresses = []) {
    const results = {};
    if (!contractAddresses || contractAddresses.length === 0) return results;

    const valid = contractAddresses
      .map(a => (a || '').trim())
      .filter(a => /^0x[a-fA-F0-9]{40}$/.test(a) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a));

    const uniqueAddrs = [...new Set(valid)];

    for (let i = 0; i < uniqueAddrs.length; i += 30) {
      const chunk = uniqueAddrs.slice(i, i + 30);
      try {
        const url = `https://api.dexscreener.com/latest/dex/tokens/${chunk.join(',')}`;
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const data = await resp.json();
        const pairs = Array.isArray(data) ? data : (data.pairs || []);

        pairs.forEach(p => {
          const baseAddr = (p.baseToken?.address || '').toLowerCase();
          const pUsd = parseFloat(p.priceUsd);
          if (!baseAddr || isNaN(pUsd) || pUsd <= 0) return;

          // Crucial: Only consider pairs where baseToken is the token address queried
          if (!chunk.some(c => c.toLowerCase() === baseAddr)) return;

          const liq = p.liquidity?.usd || 0;
          if (!results[baseAddr] || liq > (results[baseAddr]._liq || 0)) {
            const sym = (p.baseToken?.symbol || '').toUpperCase();
            const entry = {
              usd:            pUsd,
              usd_24h_change: p.priceChange?.h24 != null ? parseFloat(p.priceChange.h24) : null,
              source:         'dexscreener',
              _liq:           liq,
            };
            results[baseAddr] = entry;
            if (sym && !results[sym]) results[sym] = entry;
          }
        });
      } catch (e) {
        console.warn('[PriceEngine] DexScreener batch fetch error:', e.message);
      }
    }
    return results;
  }

  /**
   * Fetch token price from DexScreener using exact contract address or query
   */
  async function fetchDexScreenerTokenPrice(tokenOrContract) {
    if (!tokenOrContract) return null;
    try {
      const isAddr = /^0x[a-fA-F0-9]{40}$/.test(tokenOrContract) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(tokenOrContract);
      const url = isAddr
        ? `https://api.dexscreener.com/latest/dex/tokens/${tokenOrContract}`
        : `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(tokenOrContract)}`;

      const resp = await fetch(url);
      if (!resp.ok) return null;
      const raw = await resp.json();
      const pairs = Array.isArray(raw) ? raw : (raw.pairs || []);

      const targetAddr = isAddr ? tokenOrContract.toLowerCase() : null;

      // Ensure baseToken matches target contract so we never pick a quote token (e.g. USDC $0.99)
      let validPairs = pairs;
      if (targetAddr) {
        const basePairs = pairs.filter(p => (p.baseToken?.address || '').toLowerCase() === targetAddr);
        if (basePairs.length > 0) validPairs = basePairs;
      }

      validPairs = validPairs.filter(p => {
        const liq = p.liquidity?.usd || 0;
        const vol = p.volume?.h24 || 0;
        return isAddr ? true : (liq >= 5000 && vol >= 500);
      }).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));

      const pair = validPairs[0];
      if (pair && pair.priceUsd) {
        return {
          usd:            parseFloat(pair.priceUsd),
          usd_24h_change: pair.priceChange?.h24 != null ? parseFloat(pair.priceChange.h24) : null,
          source:         'dexscreener',
        };
      }
    } catch (e) { /* skip */ }
    return null;
  }

  /**
   * Main price resolver:
   * 1. Preset stablecoins ($1.00)
   * 2. Binance Live Tickers (instant institutional CEX)
   * 3. DexScreener batch for all on-chain contract tokens
   * 4. CoinGecko simple/price for remaining missing IDs
   */
  async function getPrices(coinIds = [], symbols = [], contractTokens = []) {
    const resultMap = {};

    // 1. Preset stablecoins (strictly anchored)
    const STABLES = ['USDT', 'USDC', 'DAI', 'FDUSD', 'USDE', 'PYUSD', 'USDC.E', 'tether', 'usd-coin'];
    STABLES.forEach(s => {
      resultMap[s] = { usd: 1.00, usd_24h_change: 0, source: 'stable' };
      resultMap[s.toLowerCase()] = { usd: 1.00, usd_24h_change: 0, source: 'stable' };
    });

    // 2. Fetch live Binance tickers (covers all major and mid-caps with 0 latency)
    const bPrices = await fetchLiveBinanceTickers();
    Object.assign(resultMap, bPrices);

    // 3. Batch fetch all on-chain contract tokens from DexScreener
    if (contractTokens && contractTokens.length > 0) {
      const contractAddrs = contractTokens.map(c => c.contract).filter(Boolean);
      const dexPrices = await fetchDexScreenerBatch(contractAddrs);
      Object.assign(resultMap, dexPrices);
    }

    // 4. CoinGecko simple/price for remaining missing IDs
    const missingCgIds = coinIds.filter(id => !resultMap[id] && !resultMap[id.toUpperCase()]);
    if (missingCgIds.length > 0) {
      try {
        const ids = [...new Set(missingCgIds)].slice(0, 30).join(',');
        const url = `${CG_BASE}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`;
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          Object.entries(data).forEach(([id, val]) => {
            if (val && val.usd != null) {
              resultMap[id] = {
                usd:            val.usd,
                usd_24h_change: val.usd_24h_change ?? null,
                market_cap:     val.usd_market_cap ?? null,
                source:         'coingecko',
              };
            }
          });
        }
      } catch (e) {
        console.warn('[PriceEngine] CoinGecko fallback failed:', e.message);
      }
    }

    // 5. Merge with existing cache so known prices are never lost
    const cache = CF.Storage.getPriceCache()?.data || {};
    const merged = { ...cache, ...resultMap };
    return merged;
  }

  /**
   * Small coin images from CoinGecko
   */
  async function getCoinImages(coinIds) {
    const map = {};
    if (!coinIds || coinIds.length === 0) return map;
    try {
      const ids  = [...new Set(coinIds)].slice(0, 50).join(',');
      const url  = `${CG_BASE}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=100&page=1&sparkline=false`;
      const resp = await fetch(url);
      if (!resp.ok) return map;
      const data = await resp.json();
      if (Array.isArray(data)) {
        data.forEach(coin => { map[coin.id] = coin.image; });
      }
    } catch (e) { /* silent */ }
    return map;
  }

  /**
   * Search for a coin by query
   */
  async function searchCoin(query) {
    try {
      const resp = await fetch(`${CG_BASE}/search?query=${encodeURIComponent(query)}`);
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data.coins || []).slice(0, 6).map(c => ({
        id:     c.id,
        name:   c.name,
        symbol: c.symbol.toUpperCase(),
        thumb:  c.thumb,
      }));
    } catch (e) {
      return [];
    }
  }

  return { getPrices, getCoinImages, searchCoin, fetchDexScreenerTokenPrice, fetchDexScreenerBatch };
})();
