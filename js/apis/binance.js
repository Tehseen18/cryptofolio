/* ============================================================
   binance.js — Binance spot portfolio via REST API
   Uses HMAC-SHA256 (Web Crypto API) — no npm needed.
   Requires local proxy (proxy/proxy.js) to bypass CORS.
   ============================================================ */

window.CF = window.CF || {};

CF.BinanceAPI = (() => {
  // Known CoinGecko IDs for Binance tickers
  const COIN_MAP = {
    BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin',
    SOL: 'solana', ADA: 'cardano', XRP: 'ripple',
    DOT: 'polkadot', AVAX: 'avalanche-2', MATIC: 'matic-network',
    LINK: 'chainlink', UNI: 'uniswap', ATOM: 'cosmos',
    LTC: 'litecoin', BCH: 'bitcoin-cash', ETC: 'ethereum-classic',
    NEAR: 'near', FTM: 'fantom', ALGO: 'algorand',
    VET: 'vechain', ICP: 'internet-computer', THETA: 'theta-token',
    XLM: 'stellar', TRX: 'tron', EOS: 'eos', DOGE: 'dogecoin',
    SHIB: 'shiba-inu', INJ: 'injective-protocol', SEI: 'sei-network',
    OSMO: 'osmosis', ARB: 'arbitrum', OP: 'optimism',
    USDT: 'tether', USDC: 'usd-coin', BUSD: 'binance-usd',
    PEPE: 'pepe', SUI: 'sui', APT: 'aptos',
    TON: 'the-open-network', HBAR: 'hedera-hashgraph',
    STRK: 'starknet', TIA: 'celestia', JUP: 'jupiter-exchange-solana',
  };

  /**
   * Sign a query string with HMAC-SHA256 using Web Crypto API
   */
  async function hmacSign(secret, message) {
    const enc     = new TextEncoder();
    const keyData = enc.encode(secret);
    const msgData = enc.encode(message);
    const key     = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig  = await crypto.subtle.sign('HMAC', key, msgData);
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Build a signed request URL via the local proxy
   */
  async function signedRequest(endpoint, apiKey, apiSecret, params = {}) {
    const settings    = CF.Storage.getSettings();
    const proxyBase   = settings.proxyUrl || CF.BINANCE_PROXY;

    const timestamp   = Date.now();
    const queryObj    = { ...params, timestamp };
    const queryString = new URLSearchParams(queryObj).toString();
    const signature   = await hmacSign(apiSecret, queryString);
    const fullQuery   = `${queryString}&signature=${signature}`;

    const url = `${proxyBase}${endpoint}?${fullQuery}`;
    const resp = await fetch(url, {
      headers: { 'X-MBX-APIKEY': apiKey },
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`Binance ${resp.status}: ${errBody}`);
    }
    return resp.json();
  }

  /**
   * Fetch spot account balances
   */
  async function getSpotBalances(apiKey, apiSecret) {
    const data = await signedRequest('/api/v3/account', apiKey, apiSecret);
    return (data.balances || [])
      .filter(b => parseFloat(b.free) + parseFloat(b.locked) > 0)
      .map(b => ({
        symbol:  b.asset,
        balance: parseFloat(b.free) + parseFloat(b.locked),
        free:    parseFloat(b.free),
        locked:  parseFloat(b.locked),
      }));
  }

  /**
   * Aggregate holdings for a Binance source
   */
  async function fetchHoldings(source) {
    const balances = await getSpotBalances(source.apiKey, source.apiSecret);
    return balances
      .filter(b => b.balance > 0)
      .map(b => ({
        coingeckoId: COIN_MAP[b.symbol] || null,
        symbol:      b.symbol,
        name:        b.symbol,
        balance:     b.balance,
        valueUSD:    null,
      }));
  }

  /**
   * Test connectivity (no auth)
   */
  async function ping() {
    const settings = CF.Storage.getSettings();
    const proxy    = settings.proxyUrl || CF.BINANCE_PROXY;
    const resp = await fetch(`${proxy}/api/v3/ping`);
    return resp.ok;
  }

  return { fetchHoldings, getSpotBalances, ping };
})();
