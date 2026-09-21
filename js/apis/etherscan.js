/* ============================================================
   etherscan.js — ETH + ERC-20 balances
   Uses APIs with proper CORS support from localhost:
   • Ethplorer (free, no key) → ETH balance + ALL tokens in 1 call
   • Blockscout (open-source, no key) → fallback ETH balance
   • Etherscan (optional key) → used only as last resort
   ============================================================ */

window.CF = window.CF || {};

CF.EtherscanAPI = (() => {
  const ETHPLORER  = 'https://api.ethplorer.io';
  const BLOCKSCOUT = 'https://eth.blockscout.com/api';

  // Ethplorer symbol → CoinGecko ID map
  const TOKEN_MAP = {
    'USDT': 'tether',          'USDC': 'usd-coin',
    'DAI':  'dai',             'WBTC': 'wrapped-bitcoin',
    'WETH': 'weth',            'LINK': 'chainlink',
    'UNI':  'uniswap',         'AAVE': 'aave',
    'MKR':  'maker',           'CRV':  'curve-dao-token',
    'SHIB': 'shiba-inu',       'PEPE': 'pepe',
    'ARB':  'arbitrum',        'OP':   'optimism',
    'LDO':  'lido-dao',        'RPL':  'rocket-pool',
    'MATIC':'matic-network',   'BUSD': 'binance-usd',
    'GRT':  'the-graph',       'ENS':  'ethereum-name-service',
    'SAND': 'the-sandbox',     'MANA': 'decentraland',
    'APE':  'apecoin',         'IMX':  'immutable-x',
    'SNX':  'havven',          'COMP': 'compound-governance-token',
    'FTM':  'fantom',          'BLUR': 'blur',
    'INJ':  'injective-protocol',
  };

  // ── Strategy 1: Ethplorer (free, no key, ETH + all tokens in 1 call) ──

  async function fetchFromEthplorer(address) {
    const url  = `${ETHPLORER}/getAddressInfo/${encodeURIComponent(address)}?apiKey=freekey`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Ethplorer HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message || 'Ethplorer error');

    const holdings = [];

    // ETH balance
    const ethBalance = data.ETH?.balance || 0;
    if (ethBalance > 0) {
      holdings.push({
        coingeckoId: 'ethereum',
        symbol:      'ETH',
        name:        'Ethereum',
        balance:     ethBalance,
        valueUSD:    null,
      });
    }

    // ERC-20 tokens
    const tokens = data.tokens || [];
    tokens.forEach(t => {
      try {
        const info     = t.tokenInfo;
        const decimals = parseInt(info.decimals) || 18;
        const raw      = parseFloat(t.rawBalance || t.balance || 0);
        const balance  = raw / Math.pow(10, decimals);
        if (balance <= 0.000001) return;

        holdings.push({
          coingeckoId: TOKEN_MAP[info.symbol] || null,
          symbol:      info.symbol,
          name:        info.name,
          balance,
          valueUSD:    null,
        });
      } catch (e) { /* skip malformed token */ }
    });

    return holdings;
  }

  // ── Strategy 2: PublicNode Ethereum RPC (ETH balance, no key, CORS-safe) ──

  async function fetchFromRpc(address) {
    const resp = await fetch('https://ethereum-rpc.publicnode.com', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] }),
    });
    if (!resp.ok) throw new Error(`Ethereum RPC HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data.result) throw new Error('Ethereum RPC empty result');

    const balance = parseInt(data.result, 16) / 1e18;
    if (balance <= 0) return [];
    return [{
      coingeckoId: 'ethereum',
      symbol:      'ETH',
      name:        'Ethereum',
      balance,
      valueUSD:    null,
    }];
  }

  // ── Strategy 3: Etherscan (user key, rate-limited) ──────────────────────

  async function fetchFromEtherscan(address, apiKey) {
    const balUrl  = `${CF.ETHERSCAN_API}?module=account&action=balance&address=${address}&tag=latest&apikey=${apiKey}`;
    const balResp = await fetch(balUrl);
    const balData = await balResp.json();
    if (balData.status !== '1') throw new Error(balData.message || 'Etherscan error');

    const ethBalance = parseInt(balData.result) / 1e18;
    const holdings   = [];

    if (ethBalance > 0) {
      holdings.push({ coingeckoId: 'ethereum', symbol: 'ETH', name: 'Ethereum', balance: ethBalance, valueUSD: null });
    }
    return holdings;
  }

  // ── Main entry point: try each strategy with fallback ──────────────────

  async function fetchHoldings(source) {
    const settings = CF.Storage.getSettings();
    const apiKey   = settings.etherscanKey?.trim() || '';

    const errors = [];

    // Try Ethplorer first — free, CORS-friendly, ETH + tokens in one call
    try {
      const holdings = await fetchFromEthplorer(source.address);
      console.info(`[ETH] Ethplorer: ${holdings.length} assets for ${source.name}`);
      return holdings;
    } catch (e) {
      errors.push(`Ethplorer: ${e.message}`);
      console.warn('[ETH] Ethplorer failed:', e.message);
    }

    // Try PublicNode Ethereum RPC — ETH balance, no key
    try {
      const holdings = await fetchFromRpc(source.address);
      console.info(`[ETH] RPC fallback: ${holdings.length} assets`);
      CF.Notify.info('Showing ETH only (token APIs unreachable). Tokens will appear when connectivity is restored.');
      return holdings;
    } catch (e) {
      errors.push(`Ethereum RPC: ${e.message}`);
      console.warn('[ETH] RPC failed:', e.message);
    }

    // Try Etherscan with user key
    if (apiKey) {
      try {
        const holdings = await fetchFromEtherscan(source.address, apiKey);
        console.info(`[ETH] Etherscan fallback: ${holdings.length} assets`);
        return holdings;
      } catch (e) {
        errors.push(`Etherscan: ${e.message}`);
        console.warn('[ETH] Etherscan failed:', e.message);
      }
    }

    // All failed — give a useful error
    throw new Error(
      `Cannot reach Ethereum APIs. Check internet connection.\n` +
      `Tried: ${errors.join('; ')}`
    );
  }

  return { fetchHoldings, fetchFromEthplorer, fetchFromRpc };
})();
