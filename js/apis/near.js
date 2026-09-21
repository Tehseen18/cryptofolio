/* ============================================================
   near.js — NEAR Protocol ($NEAR) Blockchain Engine
   • Native NEAR balance (yoctoNEAR / 1e24)
   • Supports named accounts (*.near) & 64-hex implicit accounts
   • High-speed NEAR official JSON-RPC (https://rpc.mainnet.near.org)
   • Real-time Binance ticker & CoinGecko prices
   ============================================================ */

window.CF = window.CF || {};

CF.NearAPI = (() => {

  const NEAR_RPC = 'https://rpc.mainnet.near.org';

  /**
   * Query NEAR account state via JSON-RPC
   */
  async function getNearAccount(address) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);

    try {
      const resp = await fetch(NEAR_RPC, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          jsonrpc: '2.0',
          id:      'cryptofolio-near',
          method:  'query',
          params:  {
            request_type: 'view_account',
            finality:     'final',
            account_id:   address,
          },
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) {
        throw new Error(`NEAR RPC HTTP error ${resp.status}`);
      }

      const data = await resp.json();
      if (data.error) {
        if (data.error.cause?.name === 'UNKNOWN_ACCOUNT') {
          return { balance: 0, exists: false };
        }
        throw new Error(data.error.message || 'NEAR RPC Error');
      }

      const rawYocto = data.result?.amount || '0';
      // Convert yoctoNEAR (1e24) to NEAR
      // Since yoctoNEAR is a large string, handle safely
      let bal = 0;
      if (rawYocto.length > 24) {
        const whole = rawYocto.slice(0, rawYocto.length - 24);
        const frac  = rawYocto.slice(rawYocto.length - 24, rawYocto.length - 18);
        bal = parseFloat(`${whole}.${frac}`);
      } else {
        const padded = rawYocto.padStart(25, '0');
        const whole  = padded.slice(0, padded.length - 24);
        const frac   = padded.slice(padded.length - 24, padded.length - 18);
        bal = parseFloat(`${whole}.${frac}`);
      }

      return { balance: bal, exists: true };
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  /**
   * Main fetchHoldings entry point for NEAR
   */
  async function fetchHoldings(source) {
    let address = (source.address || '').trim();
    address = address.replace(/^near:/i, '').split('?')[0].trim();

    if (!address) {
      throw new Error('Please enter a valid NEAR address');
    }

    // Validate NEAR address format: either named (min 2 chars, lowercase, letters, digits, _, -, .) or 64 hex
    const isNamed = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(address) && address.length >= 2 && address.length <= 64;
    const isHex   = /^[0-9a-fA-F]{64}$/.test(address);

    if (!isNamed && !isHex) {
      throw new Error(`Invalid NEAR address: "${address}". Expected format like "name.near" or 64-hex key.`);
    }

    CF.Notify.info(`Scanning NEAR Protocol for ${address.slice(0, 10)}...`, 4000);

    const account = await getNearAccount(address);

    const priceCache = CF.Storage?.getPriceCache()?.data || {};
    let nearPrice  = priceCache['NEAR']?.usd || priceCache['near']?.usd || null;
    let nearChange = priceCache['NEAR']?.usd_24h_change ?? priceCache['near']?.usd_24h_change ?? null;

    if (!nearPrice && CF.CoinGecko?.getPrice) {
      try {
        const live = await CF.CoinGecko.getPrice('near');
        if (live?.usd) {
          nearPrice  = live.usd;
          nearChange = live.usd_24h_change;
        }
      } catch (e) { /* skip */ }
    }

    const holdings = [{
      symbol:      'NEAR',
      name:        'NEAR Protocol',
      balance:     account.balance,
      decimals:    24,
      contract:    'native',
      chain:       'NEAR',
      chains:      ['NEAR'],
      price:       nearPrice,
      change24h:   nearChange,
      valueUSD:    nearPrice ? account.balance * nearPrice : null,
      image:       'https://assets.coingecko.com/coins/images/10365/small/near.png',
      coingeckoId: 'near',
      isCore:      true,
      isSpam:      false,
    }];

    console.info(`[NearAPI] Fetched ${account.balance} NEAR for ${address}`);
    return holdings;
  }

  return { fetchHoldings, getNearAccount };
})();
