/* ============================================================
   transactions.js — Multi-chain transaction history & P&L
   Supports: EVM (Blockscout & Etherscan), Bitcoin (Mempool),
             Solana, Dogecoin, Aptos, ICP, TON, Stacks, BSC, Binance
   ============================================================ */

window.CF = window.CF || {};

CF.Transactions = (() => {

  const TX_KEY = 'cf_transactions';

  // ── Storage Helpers ────────────────────────────────────────

  function getAll() {
    try { return JSON.parse(localStorage.getItem(TX_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function save(txs) {
    localStorage.setItem(TX_KEY, JSON.stringify(txs));
  }

  function mergeNew(newTxs) {
    const existing = getAll();
    const existingIds = new Set(existing.map(t => t.id));
    const toAdd = (newTxs || []).filter(t => t && t.id && !existingIds.has(t.id));
    const merged = [...existing, ...toAdd].sort((a, b) => (b.date || 0) - (a.date || 0));
    // Cap at 2000 transactions
    save(merged.slice(0, 2000));
    return toAdd.length;
  }

  function clearForSource(sourceId) {
    save(getAll().filter(t => t.sourceId !== sourceId));
  }

  // ── EVM Transactions (Blockscout & Etherscan Fallback) ───────

  async function fetchEvmTransactions(source) {
    const address = (source.address || '').toLowerCase().trim();
    if (!address) return [];

    const txs = [];
    const settings = CF.Storage.getSettings() || {};
    const etherscanKey = settings.etherscanKey;

    // 1. Try Blockscout Ethereum (Free, no API key required, open CORS)
    try {
      const url = `https://eth.blockscout.com/api?module=account&action=txlist&address=${address}&sort=desc&offset=50`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.result)) {
          data.result.forEach(tx => {
            if (tx.isError === '1') return;
            const value = parseFloat(tx.value || '0') / 1e18;
            const isIncoming = (tx.to || '').toLowerCase() === address;
            const time = parseInt(tx.timeStamp) * 1000;

            txs.push({
              id:          `eth_${tx.hash}`,
              sourceId:    source.id,
              sourceName:  source.name,
              type:        isIncoming ? 'receive' : 'send',
              date:        time,
              symbol:      'ETH',
              name:        'Ethereum',
              chain:       'Ethereum',
              network:     'ethereum',
              coingeckoId: 'ethereum',
              amount:      value,
              fee:         (parseFloat(tx.gasUsed || '0') * parseFloat(tx.gasPrice || '0')) / 1e18,
              txHash:      tx.hash,
              from:        tx.from,
              to:          tx.to,
              explorerUrl: `https://etherscan.io/tx/${tx.hash}`,
            });
          });
        }
      }
    } catch (e) {
      console.warn('[Tx] Blockscout ETH error:', e);
    }

    // 2. Token transfers (ERC-20) via Blockscout
    try {
      const url = `https://eth.blockscout.com/api?module=account&action=tokentx&address=${address}&sort=desc&offset=50`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.result)) {
          data.result.forEach(tx => {
            const decimals = parseInt(tx.tokenDecimal) || 18;
            const amount = parseFloat(tx.value || '0') / Math.pow(10, decimals);
            if (amount <= 0) return;
            const isIncoming = (tx.to || '').toLowerCase() === address;
            const sym = (tx.tokenSymbol || 'TOKEN').toUpperCase();

            txs.push({
              id:          `erc20_${tx.hash}_${tx.contractAddress || ''}`,
              sourceId:    source.id,
              sourceName:  source.name,
              type:        isIncoming ? 'receive' : 'send',
              date:        parseInt(tx.timeStamp) * 1000,
              symbol:      sym,
              name:        tx.tokenName || sym,
              chain:       'Ethereum',
              network:     'ethereum',
              coingeckoId: sym.toLowerCase(),
              amount:      amount,
              fee:         null,
              txHash:      tx.hash,
              from:        tx.from,
              to:          tx.to,
              explorerUrl: `https://etherscan.io/tx/${tx.hash}`,
            });
          });
        }
      }
    } catch (_) {}

    // 3. If user has custom Etherscan key and Blockscout gave 0 txs, try Etherscan
    if (txs.length === 0 && etherscanKey) {
      try {
        const url = `${CF.ETHERSCAN_API}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&offset=50&page=1&apikey=${etherscanKey}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.status === '1' && Array.isArray(data.result)) {
          data.result.forEach(tx => {
            if (tx.isError === '1') return;
            const value = parseFloat(tx.value) / 1e18;
            const isIncoming = (tx.to || '').toLowerCase() === address;
            txs.push({
              id:          `eth_${tx.hash}`,
              sourceId:    source.id,
              sourceName:  source.name,
              type:        isIncoming ? 'receive' : 'send',
              date:        parseInt(tx.timeStamp) * 1000,
              symbol:      'ETH',
              name:        'Ethereum',
              chain:       'Ethereum',
              network:     'ethereum',
              coingeckoId: 'ethereum',
              amount:      value,
              fee:         (parseFloat(tx.gasUsed) * parseFloat(tx.gasPrice)) / 1e18,
              txHash:      tx.hash,
              from:        tx.from,
              to:          tx.to,
              explorerUrl: `https://etherscan.io/tx/${tx.hash}`,
            });
          });
        }
      } catch (_) {}
    }

    return txs;
  }

  // ── Bitcoin Transactions (Mempool.space & Blockstream) ───────

  async function fetchBtcTransactions(source) {
    const address = (source.address || '').trim();
    if (!address) return [];

    const txs = [];
    const endpoints = [
      `https://mempool.space/api/address/${address}/txs`,
      `https://blockstream.info/api/address/${address}/txs`,
    ];

    for (const url of endpoints) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const rawTxs = await resp.json();
        if (!Array.isArray(rawTxs)) continue;

        rawTxs.slice(0, 50).forEach(tx => {
          let received = 0;
          let sent = 0;
          (tx.vout || []).forEach(o => {
            if (o.scriptpubkey_address === address) received += (o.value || 0);
          });
          (tx.vin || []).forEach(i => {
            if (i.prevout?.scriptpubkey_address === address) sent += (i.prevout.value || 0);
          });

          const net = (received - sent) / 1e8;
          const isReceive = net >= 0;
          const amount = Math.abs(net) || ((tx.vout?.[0]?.value || 0) / 1e8);
          const blockTime = tx.status?.block_time ? tx.status.block_time * 1000 : Date.now();

          txs.push({
            id:          `btc_${tx.txid}`,
            sourceId:    source.id,
            sourceName:  source.name,
            type:        isReceive ? 'receive' : 'send',
            date:        blockTime,
            symbol:      'BTC',
            name:        'Bitcoin',
            chain:       'Bitcoin',
            network:     'bitcoin',
            coingeckoId: 'bitcoin',
            amount:      amount,
            fee:         (tx.fee || 0) / 1e8,
            txHash:      tx.txid,
            from:        isReceive ? 'External' : address,
            to:          isReceive ? address : 'External',
            explorerUrl: `https://mempool.space/tx/${tx.txid}`,
          });
        });

        if (txs.length > 0) break;
      } catch (e) {
        console.warn('[Tx] BTC fetch error:', e.message);
      }
    }

    return txs;
  }

  // ── Solana Transactions ─────────────────────────────────────

  async function fetchSolanaTransactions(source) {
    const address = (source.address || '').trim();
    if (!address) return [];

    const txs = [];
    try {
      const res = await fetch('https://api.mainnet-beta.solana.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getSignaturesForAddress',
          params: [address, { limit: 25 }]
        })
      });

      if (res.ok) {
        const data = await res.json();
        const sigs = data.result || [];

        sigs.forEach(sig => {
          const time = sig.blockTime ? sig.blockTime * 1000 : Date.now();
          const isSuccess = !sig.err;

          txs.push({
            id:          `sol_${sig.signature}`,
            sourceId:    source.id,
            sourceName:  source.name,
            type:        'send', // Solana default activity
            date:        time,
            symbol:      'SOL',
            name:        'Solana',
            chain:       'Solana',
            network:     'solana',
            coingeckoId: 'solana',
            amount:      0, // Amount determined by full tx if needed
            fee:         null,
            txHash:      sig.signature,
            from:        address,
            to:          '',
            status:      isSuccess ? 'confirmed' : 'failed',
            explorerUrl: `https://solscan.io/tx/${sig.signature}`,
          });
        });
      }
    } catch (e) {
      console.warn('[Tx] Solana error:', e);
    }
    return txs;
  }

  // ── Dogecoin Transactions ───────────────────────────────────

  async function fetchDogeTransactions(source) {
    const address = (source.address || '').trim();
    if (!address) return [];

    const txs = [];
    try {
      const res = await fetch(`https://api.blockcypher.com/v1/doge/main/addrs/${address}`);
      if (res.ok) {
        const data = await res.json();
        const list = [...(data.txrefs || []), ...(data.unconfirmed_txrefs || [])];

        list.slice(0, 30).forEach(ref => {
          const isReceive = ref.tx_input_n < 0;
          const amount = (ref.value || 0) / 1e8;
          const time = ref.confirmed ? new Date(ref.confirmed).getTime() : Date.now();

          txs.push({
            id:          `doge_${ref.tx_hash}_${ref.tx_output_n}`,
            sourceId:    source.id,
            sourceName:  source.name,
            type:        isReceive ? 'receive' : 'send',
            date:        time,
            symbol:      'DOGE',
            name:        'Dogecoin',
            chain:       'Dogecoin',
            network:     'doge',
            coingeckoId: 'dogecoin',
            amount:      amount,
            fee:         null,
            txHash:      ref.tx_hash,
            from:        isReceive ? 'External' : address,
            to:          isReceive ? address : 'External',
            explorerUrl: `https://dogechain.info/tx/${ref.tx_hash}`,
          });
        });
      }
    } catch (e) {
      console.warn('[Tx] Doge error:', e);
    }
    return txs;
  }

  // ── BSC Transactions ────────────────────────────────────────

  async function fetchBscTransactions(source) {
    const address = (source.address || '').toLowerCase().trim();
    if (!address) return [];

    const txs = [];
    try {
      const url = `https://bsc.blockscout.com/api?module=account&action=txlist&address=${address}&sort=desc&offset=50`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.result)) {
          data.result.forEach(tx => {
            if (tx.isError === '1') return;
            const value = parseFloat(tx.value || '0') / 1e18;
            const isIncoming = (tx.to || '').toLowerCase() === address;

            txs.push({
              id:          `bsc_${tx.hash}`,
              sourceId:    source.id,
              sourceName:  source.name,
              type:        isIncoming ? 'receive' : 'send',
              date:        parseInt(tx.timeStamp) * 1000,
              symbol:      'BNB',
              name:        'BNB Chain',
              chain:       'BSC',
              network:     'bsc',
              coingeckoId: 'binancecoin',
              amount:      value,
              fee:         (parseFloat(tx.gasUsed || '0') * parseFloat(tx.gasPrice || '0')) / 1e18,
              txHash:      tx.hash,
              from:        tx.from,
              to:          tx.to,
              explorerUrl: `https://bscscan.com/tx/${tx.hash}`,
            });
          });
        }
      }
    } catch (e) {
      console.warn('[Tx] BSC error:', e);
    }
    return txs;
  }

  // ── Binance Trades ──────────────────────────────────────────

  async function fetchBinanceTrades(source) {
    const holdings = source.holdings || [];
    const txs      = [];
    const settings = CF.Storage.getSettings();
    const proxyBase = settings.proxyUrl || CF.BINANCE_PROXY;

    for (const holding of holdings) {
      const symbol = holding.symbol;
      if (['USDT','USDC','BUSD','DAI'].includes(symbol)) continue;

      for (const quote of ['USDT', 'BTC']) {
        const pair = `${symbol}${quote}`;
        try {
          const timestamp   = Date.now();
          const queryString = `symbol=${pair}&limit=50&timestamp=${timestamp}`;
          const secret      = source.apiSecret;
          const enc         = new TextEncoder();
          const key         = await crypto.subtle.importKey('raw', enc.encode(secret),
                               { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
          const sig         = await crypto.subtle.sign('HMAC', key, enc.encode(queryString));
          const sigHex      = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');

          const url  = `${proxyBase}/api/v3/myTrades?${queryString}&signature=${sigHex}`;
          const resp = await fetch(url, { headers: { 'X-MBX-APIKEY': source.apiKey } });
          if (!resp.ok) continue;
          const trades = await resp.json();
          if (!Array.isArray(trades)) continue;

          trades.forEach(t => {
            const qty   = parseFloat(t.qty);
            const price = parseFloat(t.price);
            txs.push({
              id:          `bnc_${t.id}_${pair}`,
              sourceId:    source.id,
              sourceName:  source.name,
              type:        t.isBuyer ? 'buy' : 'sell',
              date:        t.time,
              symbol,
              name:        symbol,
              chain:       'Binance',
              network:     'binance',
              coingeckoId: null,
              amount:      qty,
              priceUSD:    quote === 'USDT' ? price : null,
              totalUSD:    quote === 'USDT' ? qty * price : null,
              fee:         parseFloat(t.commission),
              feeSymbol:   t.commissionAsset,
              txHash:      String(t.id),
              explorerUrl: null,
            });
          });
          break;
        } catch (_) {}
      }
    }
    return txs;
  }

  // ── Unified Dispatcher ──────────────────────────────────────

  async function fetchForSource(source) {
    if (!source) return [];
    let txs = [];
    const h = source.apiHandler || source.network;

    try {
      if (h === 'btcexplorer' || h === 'bitcoin') {
        txs = await fetchBtcTransactions(source);
      } else if (h === 'evmScanner' || h === 'etherscan' || h === 'ethereum') {
        txs = await fetchEvmTransactions(source);
      } else if (h === 'solana') {
        txs = await fetchSolanaTransactions(source);
      } else if (h === 'doge') {
        txs = await fetchDogeTransactions(source);
      } else if (h === 'aptos') {
        if (CF.AptosAPI && CF.AptosAPI.fetchTransactions) {
          const raw = await CF.AptosAPI.fetchTransactions(source);
          txs = (raw || []).map(t => ({
            id:          `apt_${t.hash}`,
            sourceId:    source.id,
            sourceName:  source.name,
            type:        t.type || 'send',
            date:        t.timestamp * 1000,
            symbol:      'APT',
            name:        'Aptos',
            chain:       'Aptos',
            network:     'aptos',
            coingeckoId: 'aptos',
            amount:      0,
            fee:         null,
            txHash:      t.hash,
            explorerUrl: t.explorerUrl,
          }));
        }
      } else if (h === 'icp') {
        if (CF.IcpAPI && CF.IcpAPI.fetchTransactions) {
          const raw = await CF.IcpAPI.fetchTransactions(source);
          txs = (raw || []).map(t => ({
            id:          `icp_${t.hash}`,
            sourceId:    source.id,
            sourceName:  source.name,
            type:        t.type || 'receive',
            date:        t.timestamp,
            symbol:      'ICP',
            name:        'Internet Computer',
            chain:       'Internet Computer',
            network:     'icp',
            coingeckoId: 'internet-computer',
            amount:      t.amount || 0,
            fee:         null,
            txHash:      t.hash,
            explorerUrl: t.explorerUrl,
          }));
        }
      } else if (h === 'bscScan' || h === 'bsc') {
        txs = await fetchBscTransactions(source);
      } else if (h === 'binance') {
        txs = await fetchBinanceTrades(source);
      }
    } catch (err) {
      console.warn(`[Tx] Failed to fetch txs for ${source.name}:`, err);
    }

    if (txs.length > 0) {
      const added = mergeNew(txs);
      console.log(`[Tx] ${source.name}: +${added} new transactions (total: ${txs.length})`);
    }

    return txs;
  }

  // ── P&L Calculator ──────────────────────────────────────────

  function calculatePnL(transactions, currentPrices) {
    const lots     = {};
    const realized = {};

    const sorted = [...transactions].sort((a, b) => (a.date || 0) - (b.date || 0));

    sorted.forEach(tx => {
      const sym = tx.symbol;
      if (!sym) return;
      if (!lots[sym])     lots[sym]     = [];
      if (!realized[sym]) realized[sym] = 0;

      const priceUSD = tx.priceUSD || 0;

      if (tx.type === 'buy' || tx.type === 'receive') {
        if (priceUSD > 0) {
          lots[sym].push({ qty: tx.amount, costUSD: priceUSD });
        }
      } else if (tx.type === 'sell' || tx.type === 'send') {
        let remaining = tx.amount;
        let totalCost = 0;
        while (remaining > 0.000001 && lots[sym] && lots[sym].length > 0) {
          const lot = lots[sym][0];
          if (lot.qty <= remaining) {
            totalCost += lot.qty * lot.costUSD;
            remaining -= lot.qty;
            lots[sym].shift();
          } else {
            totalCost += remaining * lot.costUSD;
            lot.qty   -= remaining;
            remaining  = 0;
          }
        }
        if (priceUSD > 0) {
          const proceeds = tx.amount * priceUSD;
          realized[sym] += proceeds - totalCost;
        }
      }
    });

    const unrealized = {};
    Object.entries(lots).forEach(([sym, symLots]) => {
      const cid = transactions.find(t => t.symbol === sym)?.coingeckoId;
      const current = (cid && currentPrices[cid]?.usd) || (currentPrices[sym]?.usd);
      if (!current) return;
      const totalQty  = symLots.reduce((s, l) => s + l.qty, 0);
      const totalCost = symLots.reduce((s, l) => s + l.qty * l.costUSD, 0);
      unrealized[sym] = (totalQty * current) - totalCost;
    });

    const totalRealized   = Object.values(realized).reduce((s, v) => s + v, 0);
    const totalUnrealized = Object.values(unrealized).reduce((s, v) => s + v, 0);

    return { realized, unrealized, totalRealized, totalUnrealized };
  }

  return {
    getAll,
    save,
    mergeNew,
    clearForSource,
    fetchForSource,
    calculatePnL,
  };
})();
