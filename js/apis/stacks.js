/* ============================================================
   stacks.js — Stacks ($STX) & SIP-010 Token Engine
   • Native STX balance (micro-STX / 1e6)
   • SIP-010 fungible tokens discovery
   • Hiro Open API (https://api.hiro.so)
   • Real-time Binance ticker & CoinGecko prices
   ============================================================ */

window.CF = window.CF || {};

CF.StacksAPI = (() => {

  const HIRO_BASE = 'https://api.hiro.so';

  /**
   * Fetch STX balance and SIP-010 tokens for a Stacks address
   */
  async function fetchHoldings(source) {
    let address = (source.address || '').trim();
    address = address.replace(/^stacks:/i, '').split('?')[0].trim();

    if (!address) {
      throw new Error('Please enter a valid Stacks address');
    }

    if (!/^S[PM][0-9A-Z]{38,41}$/i.test(address)) {
      throw new Error(`Invalid Stacks address format: "${address}". Expected format starting with SP or SM.`);
    }

    CF.Notify.info(`Scanning Stacks blockchain for ${address.slice(0, 8)}...`, 4000);

    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);

    let data;
    try {
      const resp = await fetch(`${HIRO_BASE}/extended/v1/address/${encodeURIComponent(address)}/balances`, {
        headers: { 'Accept': 'application/json' },
        signal:  ctrl.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) {
        throw new Error(`Hiro API responded with status ${resp.status}`);
      }
      data = await resp.json();
    } catch (e) {
      clearTimeout(timer);
      throw new Error(`Stacks query failed: ${e.message}`);
    }

    const priceCache = CF.Storage?.getPriceCache()?.data || {};
    let stxPrice  = priceCache['STX']?.usd || priceCache['blockstack']?.usd || null;
    let stxChange = priceCache['STX']?.usd_24h_change ?? priceCache['blockstack']?.usd_24h_change ?? null;

    if (!stxPrice && CF.CoinGecko?.getPrice) {
      try {
        const live = await CF.CoinGecko.getPrice('blockstack');
        if (live?.usd) {
          stxPrice  = live.usd;
          stxChange = live.usd_24h_change;
        }
      } catch (e) { /* skip */ }
    }

    const holdings = [];

    // 1. Native STX
    const rawMicroStx = data?.stx?.balance || '0';
    const stxBal = parseFloat(rawMicroStx) / 1e6;

    if (stxBal > 0 || (Object.keys(data?.fungible_tokens || {}).length === 0)) {
      holdings.push({
        symbol:      'STX',
        name:        'Stacks',
        balance:     stxBal,
        decimals:    6,
        contract:    'native',
        chain:       'Stacks',
        chains:      ['Stacks'],
        price:       stxPrice,
        change24h:   stxChange,
        valueUSD:    stxPrice ? stxBal * stxPrice : null,
        image:       'https://assets.coingecko.com/coins/images/2069/small/Stacks_Logo_PNG.png',
        coingeckoId: 'blockstack',
        isCore:      true,
        isSpam:      false,
      });
    }

    // 2. SIP-010 Fungible Tokens
    const fungible = data?.fungible_tokens || {};
    for (const [key, val] of Object.entries(fungible)) {
      const rawAmt = parseFloat(val?.balance || '0');
      if (rawAmt <= 0) continue;

      // Format is typically: <contract_address>.<contract_name>::<asset_name>
      const parts = key.split('::');
      const assetName = parts[1] || parts[0].split('.')[1] || 'Token';
      const contractId = parts[0];

      // Standard Stacks token decimals are usually 6
      const decimals = 6;
      const bal = rawAmt / Math.pow(10, decimals);

      holdings.push({
        symbol:      assetName.toUpperCase(),
        name:        assetName,
        balance:     bal,
        decimals:    decimals,
        contract:    contractId,
        chain:       'Stacks',
        chains:      ['Stacks'],
        price:       null,
        change24h:   null,
        valueUSD:    null,
        image:       null,
        coingeckoId: assetName.toLowerCase(),
        isCore:      true,
        isSpam:      false,
      });
    }

    console.info(`[StacksAPI] Found ${holdings.length} assets for ${address}`);
    return holdings;
  }

  return { fetchHoldings };
})();
