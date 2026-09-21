/* ============================================================
   bscScan.js — BNB + BEP-20 token balances
   • Blockscout BSC (no key, CORS-safe) → BNB balance
   • BSCScan API (free key) → BEP-20 tokens (optional)
   ============================================================ */

window.CF = window.CF || {};

CF.BSCScan = (() => {
  const BLOCKSCOUT_BSC = 'https://bsc.blockscout.com/api';

  const BEP20_MAP = {
    'CAKE': 'pancakeswap-token', 'BUSD': 'binance-usd',
    'USDT': 'tether',           'USDC': 'usd-coin',
    'DAI':  'dai',              'XVS':  'venus',
    'LINK': 'chainlink',        'DOT':  'polkadot',
    'ADA':  'cardano',          'MATIC':'matic-network',
    'ETH':  'ethereum',         'BTC':  'bitcoin',
    'INJ':  'injective-protocol','UNI': 'uniswap',
    'TWT':  'trust-wallet-token','SFP': 'safepal',
    'AAVE': 'aave',             'ATOM': 'cosmos',
  };

  // ── Strategy 1: PublicNode RPC (no key, CORS-safe, subsecond) ────

  async function fetchFromRpc(address) {
    const resp = await fetch('https://bsc-rpc.publicnode.com', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] }),
    });
    if (!resp.ok) throw new Error(`BSC RPC HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data.result) throw new Error('BSC RPC empty result');

    const balance = parseInt(data.result, 16) / 1e18;
    if (balance <= 0) return [];
    return [{ coingeckoId: 'binancecoin', symbol: 'BNB', name: 'BNB', balance, valueUSD: null }];
  }

  // ── Strategy 2: BSCScan with user key ──────────────────────

  async function fetchFromBscscan(address, apiKey) {
    const url  = `${CF.BSCSCAN_API}?module=account&action=balance&address=${address}&tag=latest&apikey=${apiKey}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.status !== '1') throw new Error(data.message || 'BSCScan error');
    const balance = parseInt(data.result) / 1e18;
    if (balance <= 0) return [];
    return [{ coingeckoId: 'binancecoin', symbol: 'BNB', name: 'BNB', balance, valueUSD: null }];
  }

  // ── BEP-20 tokens via BSCScan (optional) ───────────────────

  async function getTokenBalances(address, apiKey) {
    if (!apiKey) return [];
    try {
      const url  = `${CF.BSCSCAN_API}?module=account&action=tokentx&address=${address}&sort=desc&offset=50&page=1&apikey=${apiKey}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.status !== '1' || !Array.isArray(data.result)) return [];

      const contracts = {};
      data.result.forEach(tx => {
        const key = tx.contractAddress.toLowerCase();
        if (!contracts[key]) {
          contracts[key] = { symbol: tx.tokenSymbol, name: tx.tokenName, decimals: parseInt(tx.tokenDecimal) || 18, contract: key };
        }
      });

      const tokens = [];
      for (const [contract, meta] of Object.entries(contracts).slice(0, 10)) {
        try {
          const balUrl  = `${CF.BSCSCAN_API}?module=account&action=tokenbalance&contractaddress=${contract}&address=${address}&tag=latest&apikey=${apiKey}`;
          const balResp = await fetch(balUrl);
          const balData = await balResp.json();
          const balance = parseInt(balData.result) / Math.pow(10, meta.decimals);
          if (balance > 0.000001) tokens.push({ ...meta, balance, coingeckoId: BEP20_MAP[meta.symbol] || null });
        } catch (e) { /* skip */ }
      }
      return tokens;
    } catch (e) { return []; }
  }

  // ── Main entry ──────────────────────────────────────────────

  async function fetchHoldings(source) {
    const settings = CF.Storage.getSettings();
    const apiKey   = settings.bscscanKey?.trim() || '';
    let   bnbHoldings = [];

    // Try PublicNode BSC RPC first (no key needed, CORS safe)
    try {
      bnbHoldings = await fetchFromRpc(source.address);
    } catch (e) {
      console.warn('[BSC] RPC failed:', e.message);
      // Fallback to BSCScan if user has key
      if (apiKey) {
        try { bnbHoldings = await fetchFromBscscan(source.address, apiKey); }
        catch (e2) { throw new Error(`BNB balance unavailable: ${e2.message}`); }
      } else {
        throw new Error(`BSC API unreachable: ${e.message}`);
      }
    }

    const tokens = await getTokenBalances(source.address, apiKey);
    return [...bnbHoldings, ...tokens.map(t => ({
      coingeckoId: t.coingeckoId,
      symbol: t.symbol,
      name: t.name,
      balance: t.balance,
      valueUSD: null,
    }))];
  }

  return { fetchHoldings };
})();
