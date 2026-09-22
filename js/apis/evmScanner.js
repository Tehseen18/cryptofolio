/* ============================================================
   evmScanner.js — Unified EVM Scanner across 60+ chains
   Primary Engine:
   • DeBank / Rabby open multichain API (real-time balances, prices,
     and verified tokens across 60+ EVM chains including Ethereum,
     Base, BSC, Arbitrum, Optimism, zkSync, Polygon, Scroll, etc.)
   Fallback Engine:
   • Ethplorer (Ethereum Mainnet ERC-20s)
   • PublicNode JSON-RPC (Native balances on 15+ EVM chains)
   • Multichain ERC-20 contract checks (BSC, Polygon, Arb, Base, etc.)
   ============================================================ */

window.CF = window.CF || {};

CF.EVMScanner = (() => {

  const SPAM_REGEX = /(\.com|\.io|\.xyz|\.org|\.net|\.top|\.vip|\.cc|\.link|\.site|\.app|\.live|\.me|\.info|claim|airdrop|visit|reward|gift|voucher|bonus|free|giveaway|http|\/\/)/i;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let cachedChainMap = null;

  async function getChainMap(headers) {
    if (cachedChainMap) return cachedChainMap;
    try {
      const res = await fetch('https://api.rabby.io/v1/chain/list', { headers });
      if (res.ok) {
        const list = await res.json();
        const map = {};
        list.forEach(c => { map[c.id] = c.name; });
        cachedChainMap = map;
        return cachedChainMap;
      }
    } catch (e) {
      console.warn('[EVMScanner] chain/list fetch error:', e.message);
    }
    return {
      eth: 'Ethereum', bsc: 'BNB Chain', matic: 'Polygon', arb: 'Arbitrum',
      base: 'Base', op: 'Optimism', avax: 'Avalanche', scrl: 'Scroll',
      zora: 'Zora', blast: 'Blast', linea: 'Linea', era: 'zkSync Era',
      hood: 'Robinhood', mnt: 'Mantle', celo: 'Celo', cro: 'Cronos',
      ftm: 'Fantom', sonic: 'Sonic', xdai: 'Gnosis Chain', metis: 'Metis',
      world: 'World Chain', bera: 'Berachain', mode: 'Mode', manta: 'Manta Pacific',
      taiko: 'Taiko', sei: 'Sei', abs: 'Abstract', monad: 'Monad'
    };
  }

  // Canonical CoinGecko IDs for native gas coins across EVM chains
  const NATIVE_CG_MAP = {
    eth: 'ethereum',
    base: 'ethereum',
    arb: 'ethereum',
    op: 'ethereum',
    scrl: 'ethereum',
    zora: 'ethereum',
    blast: 'ethereum',
    linea: 'ethereum',
    era: 'ethereum',
    hood: 'ethereum',
    world: 'ethereum',
    mode: 'ethereum',
    manta: 'ethereum',
    taiko: 'ethereum',
    abs: 'ethereum',
    soneium: 'ethereum',
    megaeth: 'ethereum',
    cyber: 'ethereum',
    bsc: 'binancecoin',
    opbnb: 'binancecoin',
    matic: 'matic-network',
    avax: 'avalanche-2',
    ftm: 'fantom',
    sonic: 'sonic-3',
    cro: 'crypto-com-chain',
    celo: 'celo',
    mnt: 'mantle',
    metis: 'metis-token',
    xdai: 'xdai',
    ron: 'ronin',
    flr: 'flare-networks',
    sei: 'sei-network',
    klay: 'klay-token',
    ape: 'apecoin',
  };

  // ── 1. Primary Engine: DeBank / Rabby Multichain Fast Scanner ───
  async function fetchDeBankHoldings(address, source) {
    const headers = {
      'Accept': 'application/json',
      'X-Client': 'Rabby',
      'X-Version': '0.92.86',
    };

    const chainMap = await getChainMap(headers);

    // Parallel fetch: instant cache_token_list + total_balance across all chains
    const [cacheResult, totalResult] = await Promise.allSettled([
      fetch(`https://api.rabby.io/v1/user/cache_token_list?id=${encodeURIComponent(address)}`, { headers })
        .then(r => r.ok ? r.json() : null),
      fetch(`https://api.rabby.io/v1/user/total_balance?id=${encodeURIComponent(address)}`, { headers })
        .then(r => r.ok ? r.json() : null)
    ]);

    let rawTokens = cacheResult.status === 'fulfilled' && Array.isArray(cacheResult.value) ? cacheResult.value : null;

    // Fallback if cache_token_list was empty: try history_token_list (also single-call across all chains)
    if (!rawTokens || rawTokens.length === 0) {
      try {
        const histRes = await fetch(`https://api.rabby.io/v1/user/history_token_list?id=${encodeURIComponent(address)}`, { headers });
        if (histRes.ok) {
          const histData = await histRes.json();
          if (Array.isArray(histData) && histData.length > 0) {
            rawTokens = histData;
          }
        }
      } catch (e) {
        console.warn('[EVMScanner] history_token_list fallback failed:', e.message);
      }
    }

    const existingTokens = rawTokens || [];
    const totalData = totalResult.status === 'fulfilled' ? totalResult.value : null;

    // Guarantee full chain coverage: If total_balance reported an active chain that had no ERC20s in cache,
    // fetch its native gas token balance directly
    if (totalData && Array.isArray(totalData.chain_list)) {
      const existingChains = new Set(existingTokens.filter(t => (t.amount || 0) > 0).map(t => t.chain));
      const missingActiveChains = totalData.chain_list.filter(c => (c.usd_value || 0) > 0.05 && !existingChains.has(c.id));

      if (missingActiveChains.length > 0) {
        await Promise.allSettled(missingActiveChains.map(async c => {
          try {
            const tokenId = c.native_token_id || c.id;
            const tRes = await fetch(`https://api.rabby.io/v1/user/token?id=${encodeURIComponent(address)}&chain_id=${encodeURIComponent(c.id)}&token_id=${encodeURIComponent(tokenId)}`, { headers });
            if (tRes.ok) {
              const tData = await tRes.json();
              if (tData && (tData.amount > 0 || (tData.raw_amount && tData.raw_amount > 0))) {
                existingTokens.push(tData);
              }
            }
          } catch (e) { /* ignore */ }
        }));
      }
    }

    if (!existingTokens || existingTokens.length === 0) {
      return [];
    }

    const holdings = [];

    existingTokens.forEach(t => {
      const bal = Number(t.amount);
      if (isNaN(bal) || bal <= 0) return;

      const sym = (t.optimized_symbol || t.symbol || '').trim();
      if (!sym) return;

      const chainId = (t.chain || '').toLowerCase();
      const chainName = chainMap[chainId] || (chainId ? chainId.toUpperCase() : 'EVM');

      const isNative = t.id === t.chain || !String(t.id).startsWith('0x') || (t.is_wallet === true && !String(t.id).startsWith('0x'));

      const price = typeof t.price === 'number' && t.price > 0 ? t.price : 0;
      const valUSD = price > 0 ? bal * price : null;

      const isSpam = t.is_scam === true ||
                     t.is_suspicious === true ||
                     SPAM_REGEX.test(sym) ||
                     SPAM_REGEX.test(t.name || '') ||
                     (!t.is_core && (price <= 0 || (valUSD && valUSD < 0.01)) && bal > 10000);

      // Safe CoinGecko ID assignment: only assign canonical IDs to native gas coins and verified top stables
      let cgId = null;
      if (isNative) {
        cgId = NATIVE_CG_MAP[chainId] || null;
      } else if (t.is_core && !isSpam) {
        const upSym = sym.toUpperCase();
        if (upSym === 'USDC') cgId = 'usd-coin';
        else if (upSym === 'USDT') cgId = 'tether';
        else if (upSym === 'DAI') cgId = 'dai';
        else if (upSym === 'WBTC') cgId = 'wrapped-bitcoin';
        else if (upSym === 'WETH') cgId = 'weth';
        else if (upSym === 'WBNB') cgId = 'wbnb';
        else if (upSym === 'VELO' || upSym === 'VELO(V2)' || t.id?.toLowerCase() === '0x9560e827af36c94d2ac33a39bce1fe78631088db') cgId = 'velodrome-finance';
        else if (upSym === 'AERO' || t.id?.toLowerCase() === '0x940181a94a35a4569e4529a3cdfb74e38fd98631') cgId = 'aerodrome-finance';
      }

      const change24h = typeof t.price_24h_change === 'number'
        ? t.price_24h_change * 100
        : null;

      holdings.push({
        symbol:      sym,
        name:        t.name || sym,
        balance:     bal,
        decimals:    Number(t.decimals) || 18,
        contract:    isNative ? null : (t.id || null),
        chain:       chainName,
        chains:      [chainName],
        price:       price > 0 ? price : null,
        change24h:   change24h,
        valueUSD:    valUSD > 0 ? valUSD : null,
        image:       t.logo_url || null,
        coingeckoId: cgId,
        isCore:      t.is_core !== false && !t.is_scam && !t.is_suspicious,
        isSpam:      isSpam,
        isNative:    isNative,
        sourceName:  source?.name || '',
        address:     address,
      });
    });

    console.info(`[EVMScanner] Successfully scanned ${holdings.length} assets across all chains for ${address}`);
    return holdings;
  }

  // ── Fallback EVM Chains & Tokens ───────────────────────────
  const CHAINS = [
    { id:'ethereum',  name:'Ethereum',       symbol:'ETH',  cgId:'ethereum',          decimals:18, rpc:'https://ethereum-rpc.publicnode.com' },
    { id:'bsc',       name:'BNB Chain',      symbol:'BNB',  cgId:'binancecoin',       decimals:18, rpc:'https://bsc-rpc.publicnode.com' },
    { id:'polygon',   name:'Polygon',        symbol:'POL',  cgId:'matic-network',     decimals:18, rpc:'https://polygon-bor-rpc.publicnode.com' },
    { id:'arbitrum',  name:'Arbitrum One',   symbol:'ETH',  cgId:'ethereum',          decimals:18, rpc:'https://arbitrum-one-rpc.publicnode.com' },
    { id:'base',      name:'Base',           symbol:'ETH',  cgId:'ethereum',          decimals:18, rpc:'https://base-rpc.publicnode.com' },
    { id:'optimism',  name:'Optimism',       symbol:'ETH',  cgId:'ethereum',          decimals:18, rpc:'https://optimism-rpc.publicnode.com' },
    { id:'avalanche', name:'Avalanche C',    symbol:'AVAX', cgId:'avalanche-2',       decimals:18, rpc:'https://avalanche-c-chain-rpc.publicnode.com' },
    { id:'blast',     name:'Blast',          symbol:'ETH',  cgId:'ethereum',          decimals:18, rpc:'https://blast-rpc.publicnode.com' },
    { id:'scroll',    name:'Scroll',         symbol:'ETH',  cgId:'ethereum',          decimals:18, rpc:'https://scroll-rpc.publicnode.com' },
    { id:'linea',     name:'Linea',          symbol:'ETH',  cgId:'ethereum',          decimals:18, rpc:'https://linea-rpc.publicnode.com' },
    { id:'gnosis',    name:'Gnosis',         symbol:'xDAI', cgId:'xdai',              decimals:18, rpc:'https://gnosis-rpc.publicnode.com' },
    { id:'celo',      name:'Celo',           symbol:'CELO', cgId:'celo',              decimals:18, rpc:'https://celo-rpc.publicnode.com' },
    { id:'moonbeam',  name:'Moonbeam',       symbol:'GLMR', cgId:'moonbeam',          decimals:18, rpc:'https://moonbeam-rpc.publicnode.com' },
    { id:'cronos',    name:'Cronos',         symbol:'CRO',  cgId:'crypto-com-chain',  decimals:18, rpc:'https://cronos-evm-rpc.publicnode.com' },
    { id:'mantle',    name:'Mantle',         symbol:'MNT',  cgId:'mantle',            decimals:18, rpc:'https://mantle-rpc.publicnode.com' },
    { id:'zora',      name:'Zora',           symbol:'ETH',  cgId:'ethereum',          decimals:18, rpc:'https://rpc.zora.energy' },
    { id:'metis',     name:'Metis',          symbol:'METIS',cgId:'metis-token',       decimals:18, rpc:'https://metis-rpc.publicnode.com' },
  ];

  const MULTICHAIN_TOKENS = [
    // BSC
    { chain:'BNB Chain', rpc:'https://bsc-rpc.publicnode.com', token:'0x55d398326f99059fF775485246999027B3197955', symbol:'USDT', name:'Tether USD', cgId:'tether', decimals:18 },
    { chain:'BNB Chain', rpc:'https://bsc-rpc.publicnode.com', token:'0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol:'USDC', name:'USD Coin', cgId:'usd-coin', decimals:18 },
    { chain:'BNB Chain', rpc:'https://bsc-rpc.publicnode.com', token:'0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', symbol:'CAKE', name:'PancakeSwap', cgId:'pancakeswap-token', decimals:18 },
    { chain:'BNB Chain', rpc:'https://bsc-rpc.publicnode.com', token:'0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', symbol:'BTCB', name:'Bitcoin BEP2', cgId:'bitcoin', decimals:18 },
    // Polygon
    { chain:'Polygon', rpc:'https://polygon-bor-rpc.publicnode.com', token:'0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol:'USDT', name:'Tether USD', cgId:'tether', decimals:6 },
    { chain:'Polygon', rpc:'https://polygon-bor-rpc.publicnode.com', token:'0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol:'USDC', name:'USD Coin', cgId:'usd-coin', decimals:6 },
    // Arbitrum
    { chain:'Arbitrum', rpc:'https://arbitrum-one-rpc.publicnode.com', token:'0x912CE59144191C1204E64559FE8253a0e49E6548', symbol:'ARB', name:'Arbitrum', cgId:'arbitrum', decimals:18 },
    { chain:'Arbitrum', rpc:'https://arbitrum-one-rpc.publicnode.com', token:'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol:'USDT', name:'Tether USD', cgId:'tether', decimals:6 },
    { chain:'Arbitrum', rpc:'https://arbitrum-one-rpc.publicnode.com', token:'0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol:'USDC', name:'USD Coin', cgId:'usd-coin', decimals:6 },
    // Base
    { chain:'Base', rpc:'https://base-rpc.publicnode.com', token:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol:'USDC', name:'USD Coin', cgId:'usd-coin', decimals:6 },
    { chain:'Base', rpc:'https://base-rpc.publicnode.com', token:'0x940181a94A35A4569E4529A3CDfB74e48FD98AE3', symbol:'AERO', name:'Aerodrome', cgId:'aerodrome-finance', decimals:18 },
    // Optimism
    { chain:'Optimism', rpc:'https://optimism-rpc.publicnode.com', token:'0x4200000000000000000000000000000000000042', symbol:'OP', name:'Optimism', cgId:'optimism', decimals:18 },
    { chain:'Optimism', rpc:'https://optimism-rpc.publicnode.com', token:'0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', symbol:'USDC', name:'USD Coin', cgId:'usd-coin', decimals:6 },
  ];

  function parseTokenBalance(rawVal, decimals = 18) {
    if (!rawVal) return 0;
    const dec = Number(decimals) || 0;
    const str = String(rawVal).replace(/,/g, '').trim();
    if (!/^\d+$/.test(str)) {
      const num = parseFloat(str);
      return isNaN(num) ? 0 : num;
    }
    if (dec === 0) return parseFloat(str);
    if (str.length <= dec) {
      const padded = '0.' + '0'.repeat(dec - str.length) + str;
      return parseFloat(padded);
    }
    const whole = str.slice(0, str.length - dec);
    const frac  = str.slice(str.length - dec).slice(0, 8);
    return parseFloat(`${whole}.${frac}`);
  }

  async function rpcCall(url, method, params, ms = 7000) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const resp = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal:  ctrl.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.result || null;
    } catch (e) {
      clearTimeout(timer);
      return null;
    }
  }

  async function fetchEthplorer(address) {
    try {
      const url  = `https://api.ethplorer.io/getAddressInfo/${encodeURIComponent(address)}?apiKey=freekey`;
      const ctrl = new AbortController();
      const t    = setTimeout(() => ctrl.abort(), 9000);
      const resp = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!resp.ok) return { eth: null, tokens: [] };
      const data = await resp.json();
      if (data.error) return { eth: null, tokens: [] };

      const eth = data.ETH?.balance != null ? parseFloat(data.ETH.balance) : null;
      const tokens = [];

      (data.tokens || []).forEach(t => {
        try {
          const info = t.tokenInfo || {};
          const sym  = (info.symbol || '').trim();
          if (!sym) return;

          const isSpam = SPAM_REGEX.test(sym) || SPAM_REGEX.test(info.name || '');
          const bal = parseTokenBalance(t.rawBalance || t.balance, info.decimals);
          if (bal <= 0) return;

          const vol24h = (info.price && typeof info.price.volume24h === 'number') ? info.price.volume24h : 0;
          const price = (!isSpam && info.price && typeof info.price.rate === 'number' && info.price.rate > 0 && vol24h >= 5000)
            ? info.price.rate
            : null;

          tokens.push({
            symbol:         sym,
            name:           info.name || sym,
            balance:        bal,
            decimals:       Number(info.decimals) || 18,
            contract:       info.address || null,
            chain:          'Ethereum',
            chains:         ['Ethereum'],
            price:          price,
            change24h:      null,
            valueUSD:       price ? bal * price : null,
            image:          null,
            coingeckoId:    null,
            isCore:         !isSpam,
            isSpam:         isSpam,
          });
        } catch (e) { /* skip */ }
      });

      return { eth, tokens };
    } catch (e) {
      console.warn('[EVMScanner] Ethplorer fetch failed:', e.message);
      return { eth: null, tokens: [] };
    }
  }

  async function fetchNativeBalances(address, ethplorerEth) {
    const results = await Promise.allSettled(
      CHAINS.map(async chain => {
        if (chain.id === 'ethereum' && ethplorerEth != null && ethplorerEth >= 0) {
          return { chain, balance: ethplorerEth };
        }
        const hex = await rpcCall(chain.rpc, 'eth_getBalance', [address, 'latest'], 6000);
        if (!hex || hex === '0x' || hex === '0x0') return { chain, balance: 0 };
        const bal = parseInt(hex, 16) / Math.pow(10, chain.decimals);
        return { chain, balance: isNaN(bal) ? 0 : bal };
      })
    );

    return results
      .filter(r => r.status === 'fulfilled' && r.value.balance > 0.000001)
      .map(r => r.value);
  }

  async function fetchMultichainTokens(address) {
    const cleanAddr = address.startsWith('0x') ? address.slice(2).toLowerCase() : address.toLowerCase();
    const callData  = '0x70a08231000000000000000000000000' + cleanAddr;

    const results = await Promise.allSettled(
      MULTICHAIN_TOKENS.map(async item => {
        const hex = await rpcCall(item.rpc, 'eth_call', [{ to: item.token, data: callData }, 'latest'], 5000);
        if (!hex || hex === '0x' || hex === '0x0') return null;
        const bal = parseTokenBalance(BigInt(hex).toString(), item.decimals);
        if (bal < 0.000001) return null;
        return {
          symbol:      item.symbol,
          name:        item.name,
          balance:     bal,
          decimals:    item.decimals,
          chain:       item.chain,
          chains:      [item.chain],
          coingeckoId: item.cgId,
          contract:    item.token,
          valueUSD:    null,
          price:       null,
          change24h:   null,
          image:       null,
          isCore:      true,
          isSpam:      false,
        };
      })
    );

    return results
      .filter(r => r.status === 'fulfilled' && r.value != null)
      .map(r => r.value);
  }

  // ── Main Scan Entry Point ───────────────────────────────────
  async function fetchHoldings(source) {
    const address = source.address.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error(`Invalid EVM address format: ${address}`);
    }

    CF.Notify.info(`Scanning 60+ EVM chains for ${address.slice(0, 6)}...`, 5000);

    // 1. Try Primary Engine: DeBank / Rabby
    try {
      const debankHoldings = await fetchDeBankHoldings(address, source);
      if (debankHoldings && debankHoldings.length > 0) {
        console.info(`[EVMScanner] Successfully scanned ${debankHoldings.length} assets via DeBank engine for ${address}`);
        return debankHoldings;
      }
    } catch (err) {
      console.warn('[EVMScanner] DeBank engine failed, falling back to RPC + Ethplorer:', err.message);
    }

    // 2. Fallback Engine: Ethplorer + PublicNode RPC
    const [ethplorerRes, mcTokensRes] = await Promise.allSettled([
      fetchEthplorer(address),
      fetchMultichainTokens(address),
    ]);

    const ethplorerData = ethplorerRes.status === 'fulfilled' ? ethplorerRes.value : { eth: null, tokens: [] };
    const mcTokens      = mcTokensRes.status === 'fulfilled'  ? mcTokensRes.value  : [];
    const nativeList    = await fetchNativeBalances(address, ethplorerData.eth);

    const nativeHoldings = nativeList.map(({ chain, balance }) => ({
      symbol:         chain.symbol,
      name:           chain.symbol === 'ETH' ? 'Ethereum' : chain.name,
      balance:        balance,
      decimals:       chain.decimals,
      chain:          chain.name,
      chains:         [chain.name],
      coingeckoId:    chain.cgId,
      price:          null,
      change24h:      null,
      valueUSD:       null,
      image:          null,
      isCore:         true,
      isSpam:         false,
    }));

    const fallbackHoldings = [
      ...nativeHoldings,
      ...ethplorerData.tokens,
      ...mcTokens,
    ];

    console.info(`[EVMScanner] Fallback scanner found ${fallbackHoldings.length} assets for ${address}`);
    return fallbackHoldings;
  }

  return { fetchHoldings, CHAINS };
})();
