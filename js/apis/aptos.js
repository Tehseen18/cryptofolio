/* ============================================================
   aptos.js — Aptos Network Scanner
   Fetches APT balance (Move CoinStore & Primary Fungible Store)
   and account token resources via Aptos Fullnode REST APIs.
   ============================================================ */

window.CF = window.CF || {};

CF.AptosAPI = (() => {

  const RPC_ENDPOINTS = [
    'https://fullnode.mainnet.aptoslabs.com/v1',
    'https://api.mainnet.aptoslabs.com/v1',
  ];

  /**
   * Helper to normalize Aptos address to 0x + 64 hex characters
   */
  function normalizeAddress(addr) {
    if (!addr) return '';
    let clean = addr.trim().toLowerCase();
    if (clean.startsWith('0x')) clean = clean.slice(2);
    // Pad to 64 hex chars (32 bytes)
    clean = clean.padStart(64, '0');
    return '0x' + clean;
  }

  /**
   * Execute fetch with failover across public Aptos nodes
   */
  async function rpcFetch(path, options = {}) {
    let lastErr = null;
    for (const base of RPC_ENDPOINTS) {
      try {
        const url = `${base}${path}`;
        const res = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
          }
        });

        if (res.status === 404) {
          // Account or resource not found (not necessarily an RPC error)
          const errData = await res.json().catch(() => ({}));
          return { notFound: true, data: errData };
        }

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        return { ok: true, data };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Aptos RPC endpoints unreachable');
  }

  /**
   * Query a Move view function on Aptos
   */
  async function callView(functionName, typeArgs, args) {
    try {
      const res = await rpcFetch('/view', {
        method: 'POST',
        body: JSON.stringify({
          function: functionName,
          type_arguments: typeArgs || [],
          arguments: args || []
        })
      });
      if (res && res.ok && Array.isArray(res.data)) {
        return res.data;
      }
    } catch (e) {
      // ignore view error
    }
    return null;
  }

  /**
   * Fetch live APT price from Binance (with CoinGecko cache fallback)
   */
  async function getAptPrice() {
    try {
      const res = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=APTUSDT');
      if (res.ok) {
        const data = await res.json();
        const price = parseFloat(data.lastPrice);
        const change24h = parseFloat(data.priceChangePercent);
        if (!isNaN(price) && price > 0) {
          return { price, change24h };
        }
      }
    } catch (_) {}

    const cached = CF.Storage?.getPriceCache()?.data?.['aptos'];
    return {
      price: cached?.usd || 0,
      change24h: cached?.usd_24h_change ?? 0,
    };
  }

  /**
   * Fetch all holdings for an Aptos source
   */
  async function fetchHoldings(source) {
    const rawAddr = (source.address || '').trim();
    if (!rawAddr) return [];

    const normAddr = normalizeAddress(rawAddr);
    const holdings = [];

    // 1. Fetch live APT price
    const { price: aptPrice, change24h: aptChange } = await getAptPrice();

    // 2. Fetch Native APT balance using both Coin & Primary Fungible Store views
    let coinOctas = 0n;
    let faOctas = 0n;

    const coinView = await callView(
      '0x1::coin::balance',
      ['0x1::aptos_coin::AptosCoin'],
      [normAddr]
    );
    if (coinView && coinView[0]) {
      try { coinOctas = BigInt(coinView[0]); } catch (_) {}
    }

    const faView = await callView(
      '0x1::primary_fungible_store::balance',
      ['0x1::fungible_asset::Metadata'],
      [normAddr, '0xa']
    );
    if (faView && faView[0]) {
      try { faOctas = BigInt(faView[0]); } catch (_) {}
    }

    // Use max between CoinStore and Primary Fungible Store
    const maxOctas = coinOctas > faOctas ? coinOctas : faOctas;
    const aptBalance = Number(maxOctas) / 1e8;

    if (aptBalance > 0 || maxOctas > 0n) {
      holdings.push({
        coingeckoId: 'aptos',
        symbol:      'APT',
        name:        'Aptos',
        balance:     aptBalance,
        chain:       'Aptos',
        chains:      ['Aptos'],
        price:       aptPrice,
        change24h:   aptChange,
        valueUSD:    aptPrice > 0 ? aptBalance * aptPrice : 0,
        sourceName:  source.name || 'Aptos Wallet',
        address:     normAddr,
      });
    }

    // 3. Inspect account resources to discover other Move CoinStore tokens
    try {
      const res = await rpcFetch(`/accounts/${normAddr}/resources?limit=100`);
      if (res && res.ok && Array.isArray(res.data)) {
        for (const r of res.data) {
          const match = r.type && r.type.match(/^0x1::coin::CoinStore<(.+)>$/);
          if (!match) continue;

          const coinType = match[1];
          // Skip APT as it's already added
          if (coinType === '0x1::aptos_coin::AptosCoin') continue;

          const rawVal = r.data?.coin?.value;
          if (!rawVal || rawVal === '0') continue;

          const parts = coinType.split('::');
          const typeName = parts[parts.length - 1] || 'TOKEN';

          // Identify standard symbols & decimals
          let sym = typeName.toUpperCase();
          let dec = 8;
          let coinName = typeName;

          if (sym.includes('USDT')) {
            sym = 'USDT';
            dec = 6;
            coinName = 'Tether USD';
          } else if (sym.includes('USDC')) {
            sym = 'USDC';
            dec = 6;
            coinName = 'USD Coin';
          } else if (sym.includes('WETH')) {
            sym = 'WETH';
            dec = 8;
            coinName = 'Wrapped Ether';
          } else if (sym.includes('WBTC')) {
            sym = 'WBTC';
            dec = 8;
            coinName = 'Wrapped Bitcoin';
          }

          const bal = Number(BigInt(rawVal)) / Math.pow(10, dec);
          if (bal > 0) {
            holdings.push({
              coingeckoId: sym.toLowerCase(),
              symbol:      sym,
              name:        coinName,
              balance:     bal,
              chain:       'Aptos',
              chains:      ['Aptos'],
              price:       null,
              change24h:   null,
              valueUSD:    0,
              sourceName:  source.name || 'Aptos Wallet',
              address:     normAddr,
            });
          }
        }
      }
    } catch (_) {
      // resource discovery is optional fallback
    }

    // If account has zero balance across all assets, still return APT with 0 balance
    if (holdings.length === 0) {
      holdings.push({
        coingeckoId: 'aptos',
        symbol:      'APT',
        name:        'Aptos',
        balance:     0,
        chain:       'Aptos',
        chains:      ['Aptos'],
        price:       aptPrice,
        change24h:   aptChange,
        valueUSD:    0,
        sourceName:  source.name || 'Aptos Wallet',
        address:     normAddr,
      });
    }

    return holdings;
  }

  /**
   * Fetch recent transactions for an Aptos address
   */
  async function fetchTransactions(source) {
    const rawAddr = (source.address || '').trim();
    if (!rawAddr) return [];

    const normAddr = normalizeAddress(rawAddr);

    try {
      const res = await rpcFetch(`/accounts/${normAddr}/transactions?limit=25`);
      if (!res || !res.ok || !Array.isArray(res.data)) return [];

      return res.data.map(tx => {
        const hash = tx.hash || tx.version || '';
        const timestamp = tx.timestamp ? Math.floor(Number(tx.timestamp) / 1000) : Date.now();
        const success = tx.success !== false;

        return {
          id: hash,
          hash: hash,
          chain: 'Aptos',
          type: tx.sender === normAddr ? 'send' : 'receive',
          from: tx.sender || '',
          to: normAddr,
          symbol: 'APT',
          timestamp: timestamp,
          status: success ? 'confirmed' : 'failed',
          explorerUrl: `https://explorer.aptoslabs.com/txn/${hash}?network=mainnet`,
        };
      });
    } catch (_) {
      return [];
    }
  }

  return {
    normalizeAddress,
    fetchHoldings,
    fetchTransactions,
  };
})();
