/* ============================================================
   btcexplorer.js — Multi-Explorer Bitcoin Balance Engine
   • Primary: Mempool.space open API (Supports Legacy, SegWit, Taproot)
   • Secondary: Blockstream Esplora API
   • Tertiary: Blockchain.info Balance API
   • 100% Free, Zero API Keys, Full CORS compatibility
   ============================================================ */

window.CF = window.CF || {};

CF.BTCExplorer = (() => {

  /**
   * Fetch BTC balance for a given address with automatic explorer failover
   */
  async function getBalanceForAddress(address) {
    let cleanAddr = (address || '').trim();
    cleanAddr = cleanAddr.replace(/^bitcoin:/i, '').split('?')[0].trim();

    if (/^[xyz]pub/i.test(cleanAddr)) {
      throw new Error(`You entered an Extended Public Key (${cleanAddr.slice(0, 4)}...). HD wallets (like Ledger, Trezor) derive separate addresses. Please enter a specific receiving address (e.g. bc1q... or 1... or 3...).`);
    }

    if (cleanAddr.toLowerCase().startsWith('bc1')) {
      cleanAddr = cleanAddr.toLowerCase();
    }

    // 1. Try Mempool.space (Fastest, real-time mempool + confirmed UTXOs)
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const resp = await fetch(`https://mempool.space/api/address/${encodeURIComponent(cleanAddr)}`, {
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.chain_stats) {
          const confirmed   = (data.chain_stats.funded_txo_sum || 0) - (data.chain_stats.spent_txo_sum || 0);
          const unconfirmed = (data.mempool_stats?.funded_txo_sum || 0) - (data.mempool_stats?.spent_txo_sum || 0);
          const totalSats   = Math.max(0, confirmed + unconfirmed);
          const txCount     = (data.chain_stats.tx_count || 0) + (data.mempool_stats?.tx_count || 0);

          return {
            address: cleanAddr,
            balance: totalSats / 1e8,
            txCount: txCount,
            source:  'mempool.space',
          };
        }
      }
    } catch (e) {
      console.warn('[BTCExplorer] mempool.space failed:', e.message);
    }

    // 2. Try Blockstream Esplora API
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const resp = await fetch(`https://blockstream.info/api/address/${encodeURIComponent(cleanAddr)}`, {
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.chain_stats) {
          const confirmed   = (data.chain_stats.funded_txo_sum || 0) - (data.chain_stats.spent_txo_sum || 0);
          const unconfirmed = (data.mempool_stats?.funded_txo_sum || 0) - (data.mempool_stats?.spent_txo_sum || 0);
          const totalSats   = Math.max(0, confirmed + unconfirmed);
          const txCount     = (data.chain_stats.tx_count || 0) + (data.mempool_stats?.tx_count || 0);

          return {
            address: cleanAddr,
            balance: totalSats / 1e8,
            txCount: txCount,
            source:  'blockstream.info',
          };
        }
      }
    } catch (e) {
      console.warn('[BTCExplorer] blockstream.info failed:', e.message);
    }

    // 3. Fallback to Blockchain.info
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const resp = await fetch(`https://blockchain.info/balance?active=${encodeURIComponent(cleanAddr)}&cors=true`, {
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (resp.ok) {
        const data = await resp.json();
        const info = data[cleanAddr];
        if (info) {
          return {
            address: cleanAddr,
            balance: (info.final_balance || 0) / 1e8,
            txCount: info.n_tx || 0,
            source:  'blockchain.info',
          };
        }
      }
    } catch (e) {
      console.warn('[BTCExplorer] blockchain.info failed:', e.message);
    }

    throw new Error(`Failed to query Bitcoin balance across all explorers for ${cleanAddr.slice(0, 8)}...`);
  }

  /**
   * Fetch balances for multiple addresses
   */
  async function getBalances(addresses) {
    const addrs = Array.isArray(addresses) ? addresses : [addresses];
    const results = await Promise.allSettled(addrs.map(addr => getBalanceForAddress(addr)));

    return results.map((r, idx) => {
      if (r.status === 'fulfilled') return r.value;
      return { address: addrs[idx], balance: 0, error: r.reason?.message };
    });
  }

  /**
   * Main fetchHoldings entry point for Bitcoin
   */
  async function fetchHoldings(source) {
    let address = (source.address || '').trim();
    address = address.replace(/^bitcoin:/i, '').split('?')[0].trim();
    if (!address) {
      throw new Error('Please enter a valid Bitcoin address');
    }

    CF.Notify.info(`Checking Bitcoin blockchain for ${address.slice(0, 8)}...`, 4000);

    const data = await getBalanceForAddress(address);
    const priceCache = CF.Storage?.getPriceCache()?.data || {};
    let btcPrice   = priceCache['BTC']?.usd || priceCache['bitcoin']?.usd || null;
    let btcChange  = priceCache['BTC']?.usd_24h_change ?? priceCache['bitcoin']?.usd_24h_change ?? null;

    if (!btcPrice && CF.CoinGecko?.getPrice) {
      try {
        const liveBtc = await CF.CoinGecko.getPrice('bitcoin');
        if (liveBtc?.usd) {
          btcPrice  = liveBtc.usd;
          btcChange = liveBtc.usd_24h_change;
        }
      } catch (e) { /* skip */ }
    }

    let note = null;
    if (data.balance === 0) {
      if (data.txCount > 0) {
        note = `Address has ${data.txCount} past transactions, but 0 unspent UTXOs (funds were spent or transferred to change address).`;
      } else {
        note = `Unused on-chain address (0 transactions recorded on mempool.space & blockstream.info). In HD wallets, funds may be in another receiving or SegWit (bc1q...) address.`;
      }
    }

    console.info(`[BTCExplorer] Fetched ${data.balance} BTC for ${address} via ${data.source} (txs: ${data.txCount})`);

    return [{
      coingeckoId: 'bitcoin',
      symbol:      'BTC',
      name:        'Bitcoin',
      balance:     data.balance,
      decimals:    8,
      chain:       'Bitcoin',
      chains:      ['Bitcoin'],
      price:       btcPrice,
      change24h:   btcChange,
      valueUSD:    btcPrice ? data.balance * btcPrice : null,
      image:       'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
      isCore:      true,
      isSpam:      false,
      txCount:     data.txCount,
      note:        note,
    }];
  }

  return { getBalances, fetchHoldings, getBalanceForAddress };
})();
