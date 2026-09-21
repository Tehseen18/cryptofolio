/* ============================================================
   ton.js — The Open Network (TON) & $GRAM / Jettons Engine
   • Native TON balance (nanotons / 1e9) via Toncenter & TonAPI
   • Full Jettons support ($GRAM, $NOT, $DOGS, $HMSTR, USDT-TON)
   • DexScreener & Binance real-time pricing
   ============================================================ */

window.CF = window.CF || {};

CF.TonAPI = (() => {

  const TONCENTER_BASE = 'https://toncenter.com/api/v2';
  const TONAPI_BASE    = 'https://tonapi.io/v2';

  const SPAM_REGEX = /(\.com|\.io|\.xyz|\.org|\.net|\.top|\.vip|\.cc|\.link|\.site|\.app|\.live|\.me|\.info|claim|airdrop|visit|reward|gift|voucher|bonus|free|giveaway|http|\/\/)/i;

  /**
   * Fetch native TON balance
   */
  async function getTonBalance(address) {
    // 1. Try Toncenter public endpoint
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 7000);
      const resp = await fetch(`${TONCENTER_BASE}/getAddressBalance?address=${encodeURIComponent(address)}`, {
        headers: { 'Accept': 'application/json' },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (resp.ok) {
        const data = await resp.json();
        const nanotons = parseFloat(data.result || 0);
        return nanotons / 1e9;
      }
    } catch (e) { /* fallback */ }

    // 2. Fallback to TonAPI account endpoint
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 7000);
      const resp = await fetch(`${TONAPI_BASE}/accounts/${encodeURIComponent(address)}`, {
        headers: { 'Accept': 'application/json' },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (resp.ok) {
        const data = await resp.json();
        const nanotons = parseFloat(data.balance || 0);
        return nanotons / 1e9;
      }
    } catch (e) { /* skip */ }

    return 0;
  }

  /**
   * Fetch Jettons (including GRAM, NOT, DOGS, USDT-TON)
   */
  async function getJettons(address) {
    const jettons = [];
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const resp = await fetch(`${TONAPI_BASE}/accounts/${encodeURIComponent(address)}/jettons`, {
        headers: { 'Accept': 'application/json' },
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (resp.ok) {
        const data = await resp.json();
        const list = data.balances || [];

        list.forEach(item => {
          const info = item.jetton || {};
          const sym = (info.symbol || '').trim();
          const name = (info.name || sym).trim();
          if (!sym) return;

          const decimals = typeof info.decimals === 'number' ? info.decimals : 9;
          const rawBal = parseFloat(item.balance || 0);
          const bal = rawBal / Math.pow(10, decimals);
          if (bal <= 0) return;

          const isSpam = SPAM_REGEX.test(sym) || SPAM_REGEX.test(name);
          const price = parseFloat(item.price?.prices?.USD || 0) || null;

          jettons.push({
            symbol:      sym,
            name:        name,
            balance:     bal,
            decimals:    decimals,
            contract:    info.address || null,
            chain:       'TON',
            chains:      ['TON'],
            price:       price,
            change24h:   parseFloat(item.price?.diff_24h?.USD) || null,
            valueUSD:    price ? bal * price : null,
            image:       info.image || null,
            coingeckoId: sym.toLowerCase() === 'gram' ? 'gram' : sym.toLowerCase(),
            isCore:      !isSpam,
            isSpam:      isSpam,
          });
        });
      }
    } catch (e) {
      console.warn('[TonAPI] Jettons scan warning:', e.message);
    }
    return jettons;
  }

  /**
   * Main fetchHoldings entry point for TON and Gram
   */
  async function fetchHoldings(source) {
    let address = (source.address || '').trim();
    address = address.replace(/^ton:/i, '').split('?')[0].trim();

    if (!address) {
      throw new Error('Please enter a valid TON address');
    }

    CF.Notify.info(`Scanning TON blockchain for ${address.slice(0, 8)}...`, 4000);

    const [tonBal, jettons] = await Promise.all([
      getTonBalance(address),
      getJettons(address),
    ]);

    const priceCache = CF.Storage?.getPriceCache()?.data || {};
    let tonPrice  = priceCache['TON']?.usd || priceCache['the-open-network']?.usd || null;
    let tonChange = priceCache['TON']?.usd_24h_change ?? priceCache['the-open-network']?.usd_24h_change ?? null;

    if (!tonPrice && CF.CoinGecko?.getPrice) {
      try {
        const live = await CF.CoinGecko.getPrice('the-open-network');
        if (live?.usd) {
          tonPrice  = live.usd;
          tonChange = live.usd_24h_change;
        }
      } catch (e) { /* skip */ }
    }

    const holdings = [];

    // 1. Native TON
    if (tonBal > 0 || jettons.length === 0) {
      holdings.push({
        symbol:      'TON',
        name:        'The Open Network',
        balance:     tonBal,
        decimals:    9,
        contract:    'native',
        chain:       'TON',
        chains:      ['TON'],
        price:       tonPrice,
        change24h:   tonChange,
        valueUSD:    tonPrice ? tonBal * tonPrice : null,
        image:       'https://assets.coingecko.com/coins/images/17980/small/ton_symbol.png',
        coingeckoId: 'the-open-network',
        isCore:      true,
        isSpam:      false,
      });
    }

    // 2. Add Jettons (GRAM, etc.)
    jettons.forEach(j => {
      // If price was missing, check priceCache or CoinGecko
      if (!j.price) {
        const cached = priceCache[j.symbol.toUpperCase()] || priceCache[j.coingeckoId];
        if (cached && cached.usd > 0) {
          j.price = cached.usd;
          j.valueUSD = j.balance * j.price;
          if (j.change24h == null) j.change24h = cached.usd_24h_change;
        }
      }
      holdings.push(j);
    });

    console.info(`[TonAPI] Found ${holdings.length} assets for ${address}`);
    return holdings;
  }

  return { fetchHoldings, getTonBalance };
})();
