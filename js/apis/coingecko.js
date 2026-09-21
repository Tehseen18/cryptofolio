/* ============================================================
   coingecko.js — Real-Time High-Frequency Price Engine
   Combines:
   1. Binance Live Ticker 24hr Feed (sub-second institutional CEX prices,
      real-time 24h change, covers 3,700+ pairs in ONE instant call)
   2. DexScreener API (verified contract-based DEX liquidity pool prices)
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
   * Fetch token price from DexScreener using exact contract address
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

      const validPairs = pairs.filter(p => {
        const liq = p.liquidity?.usd || 0;
        const vol = p.volume?.h24 || 0;
        return isAddr ? true : (liq >= 10000 && vol >= 1000);
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
   * 1. Binance Live Tickers (instant CEX)
   * 2. Stablecoin peg anchors ($1.00)
   * 3. DexScreener for unlisted DEX tokens
   * 4. CoinGecko simple/price for non-CEX tokens
   */
  async function getPrices(coinIds = [], symbols = [], contractTokens = []) {
    const resultMap = {};

    // 1. Preset stablecoins (strictly anchored)
    const STABLES = ['USDT', 'USDC', 'DAI', 'FDUSD', 'USDE', 'PYUSD', 'tether', 'usd-coin'];
    STABLES.forEach(s => {
      resultMap[s] = { usd: 1.00, usd_24h_change: 0, source: 'stable' };
      resultMap[s.toLowerCase()] = { usd: 1.00, usd_24h_change: 0, source: 'stable' };
    });

    // 2. Fetch live Binance tickers (covers all major and mid-caps with 0 latency)
    const bPrices = await fetchLiveBinanceTickers();
    Object.assign(resultMap, bPrices);

    // 3. Check DexScreener for missing tokens with contracts
    const missingContracts = (contractTokens || []).filter(item => {
      const sym = (item.symbol || '').toUpperCase();
      return item.contract && !resultMap[sym] && !resultMap[item.contract];
    });

    if (missingContracts.length > 0) {
      await Promise.allSettled(
        missingContracts.slice(0, 8).map(async item => {
          const dexPrice = await fetchDexScreenerTokenPrice(item.contract);
          if (dexPrice && dexPrice.usd > 0) {
            const sym = (item.symbol || '').toUpperCase();
            resultMap[sym] = dexPrice;
            resultMap[sym.toLowerCase()] = dexPrice;
            resultMap[item.contract] = dexPrice;
          }
        })
      );
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

  return { getPrices, getCoinImages, searchCoin, fetchDexScreenerTokenPrice };
})();
