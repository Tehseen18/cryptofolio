/* ============================================================
   doge.js — Dogecoin ($DOGE) Blockchain Engine
   • Native DOGE balance (satoshis / 1e8)
   • BlockCypher open public API (CORS-friendly)
   • Real-time Binance ticker & CoinGecko prices
   ============================================================ */

window.CF = window.CF || {};

CF.DogeAPI = (() => {

  const BLOCKCYPHER_BASE = 'https://api.blockcypher.com/v1/doge/main';

  /**
   * Fetch balance for a Dogecoin address
   */
  async function fetchHoldings(source) {
    let address = (source.address || '').trim();
    address = address.replace(/^doge(coin)?:/i, '').split('?')[0].trim();

    if (!address) {
      throw new Error('Please enter a valid Dogecoin address');
    }

    if (!/^D[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
      throw new Error(`Invalid Dogecoin address format: "${address}". Expected format starting with "D" (34 characters).`);
    }

    CF.Notify.info(`Scanning Dogecoin blockchain for ${address.slice(0, 8)}...`, 4000);

    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);

    let data;
    try {
      const resp = await fetch(`${BLOCKCYPHER_BASE}/addrs/${encodeURIComponent(address)}/balance`, {
        headers: { 'Accept': 'application/json' },
        signal:  ctrl.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) {
        throw new Error(`BlockCypher responded with HTTP status ${resp.status}`);
      }
      data = await resp.json();
    } catch (e) {
      clearTimeout(timer);
      throw new Error(`Dogecoin query failed: ${e.message}`);
    }

    const satoshis = parseFloat(data.final_balance ?? data.balance ?? 0);
    const balance = satoshis / 1e8;

    const priceCache = CF.Storage?.getPriceCache()?.data || {};
    let dogePrice  = priceCache['DOGE']?.usd || priceCache['dogecoin']?.usd || null;
    let dogeChange = priceCache['DOGE']?.usd_24h_change ?? priceCache['dogecoin']?.usd_24h_change ?? null;

    if (!dogePrice && CF.CoinGecko?.getPrice) {
      try {
        const live = await CF.CoinGecko.getPrice('dogecoin');
        if (live?.usd) {
          dogePrice  = live.usd;
          dogeChange = live.usd_24h_change;
        }
      } catch (e) { /* skip */ }
    }

    const holdings = [{
      symbol:      'DOGE',
      name:        'Dogecoin',
      balance:     balance,
      decimals:    8,
      contract:    'native',
      chain:       'Dogecoin',
      chains:      ['Dogecoin'],
      price:       dogePrice,
      change24h:   dogeChange,
      valueUSD:    dogePrice ? balance * dogePrice : null,
      image:       'https://assets.coingecko.com/coins/images/5/small/dogecoin.png',
      coingeckoId: 'dogecoin',
      isCore:      true,
      isSpam:      false,
      txCount:     data.n_tx || 0,
    }];

    console.info(`[DogeAPI] Fetched ${balance} DOGE for ${address}`);
    return holdings;
  }

  return { fetchHoldings };
})();
