/* ============================================================
   icp.js — Internet Computer (ICP) Network Scanner
   Fetches ICP balance & transactions via DFINITY Rosetta API.
   Supports both 64-hex Account Identifiers & Principal IDs.
   ============================================================ */

window.CF = window.CF || {};

CF.IcpAPI = (() => {

  const ROSETTA_URL = 'https://rosetta-api.internetcomputer.org';
  const NETWORK_IDENTIFIER = {
    blockchain: 'Internet Computer',
    network:    '00000000000000020101',
  };

  // ── Cryptographic Helpers for Principal -> Account ID ─────────

  function crc32(buf) {
    let crc = ~0;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return (~crc) >>> 0;
  }

  const B32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
  function base32Decode(str) {
    const clean = str.toLowerCase().replace(/[^a-z2-7]/g, '');
    let bits = 0, val = 0;
    const bytes = [];
    for (let i = 0; i < clean.length; i++) {
      const idx = B32_ALPHABET.indexOf(clean[i]);
      if (idx === -1) continue;
      val = (val << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        bytes.push((val >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return new Uint8Array(bytes);
  }

  function sha224(bytes) {
    let h0 = 0xc1059ed8 | 0, h1 = 0x367cd507 | 0, h2 = 0x3070dd17 | 0, h3 = 0xf70e5939 | 0;
    let h4 = 0xffc00b31 | 0, h5 = 0x68581511 | 0, h6 = 0x64f98fa7 | 0, h7 = 0xbefa4fa4 | 0;
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    const len = bytes.length;
    const bitLen = len * 8;
    const padLen = (((len + 8) >> 6) + 1) << 6;
    const buf = new Uint8Array(padLen);
    buf.set(bytes);
    buf[len] = 0x80;
    buf[padLen - 4] = (bitLen >>> 24) & 0xff;
    buf[padLen - 3] = (bitLen >>> 16) & 0xff;
    buf[padLen - 2] = (bitLen >>> 8) & 0xff;
    buf[padLen - 1] = bitLen & 0xff;
    const w = new Int32Array(64);
    for (let i = 0; i < padLen; i += 64) {
      for (let t = 0; t < 16; t++) {
        const idx = i + (t << 2);
        w[t] = (buf[idx] << 24) | (buf[idx + 1] << 16) | (buf[idx + 2] << 8) | buf[idx + 3];
      }
      for (let t = 16; t < 64; t++) {
        const s0 = ((w[t - 15] >>> 7) | (w[t - 15] << 25)) ^ ((w[t - 15] >>> 18) | (w[t - 15] << 14)) ^ (w[t - 15] >>> 3);
        const s1 = ((w[t - 2] >>> 17) | (w[t - 2] << 15)) ^ ((w[t - 2] >>> 19) | (w[t - 2] << 13)) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let t = 0; t < 64; t++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ ((~e) & g);
        const temp1 = (h + S1 + ch + K[t] + w[t]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }
    const res = new Uint8Array(28);
    const words = [h0, h1, h2, h3, h4, h5, h6];
    for (let i = 0; i < 7; i++) {
      res[i * 4]     = (words[i] >>> 24) & 0xff;
      res[i * 4 + 1] = (words[i] >>> 16) & 0xff;
      res[i * 4 + 2] = (words[i] >>> 8) & 0xff;
      res[i * 4 + 3] = words[i] & 0xff;
    }
    return res;
  }

  /**
   * Convert ICP Principal ID (textual base32 with dashes) to 64-hex Account Identifier
   */
  function principalToAccountIdentifier(principalStr) {
    try {
      const raw = base32Decode(principalStr);
      if (raw.length < 4) return null;
      const principalBytes = raw.slice(4);
      const prefix = new TextEncoder().encode('\x0Aaccount-id');
      const subaccount = new Uint8Array(32);
      const input = new Uint8Array(prefix.length + principalBytes.length + subaccount.length);
      input.set(prefix, 0);
      input.set(principalBytes, prefix.length);
      input.set(subaccount, prefix.length + principalBytes.length);

      const hash = sha224(input);
      const c = crc32(hash);
      const res = new Uint8Array(32);
      res[0] = (c >>> 24) & 0xff;
      res[1] = (c >>> 16) & 0xff;
      res[2] = (c >>> 8) & 0xff;
      res[3] = c & 0xff;
      res.set(hash, 4);

      return Array.from(res).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (_) {
      return null;
    }
  }

  /**
   * Normalize an input into a standard 64-hex Account Identifier
   */
  function normalizeAddress(addr) {
    if (!addr) return '';
    let clean = addr.trim();

    // Check if it's a Principal ID (contains dashes with base32 chars)
    if (clean.includes('-') && /^[a-z0-9-]+$/i.test(clean)) {
      const acctId = principalToAccountIdentifier(clean);
      if (acctId) return acctId;
    }

    // Strip leading 0x if provided
    if (clean.toLowerCase().startsWith('0x')) {
      clean = clean.slice(2);
    }

    return clean.toLowerCase();
  }

  /**
   * Fetch live ICP price from Binance with CoinGecko fallback
   */
  async function getIcpPrice() {
    try {
      const res = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=ICPUSDT');
      if (res.ok) {
        const data = await res.json();
        const price = parseFloat(data.lastPrice);
        const change24h = parseFloat(data.priceChangePercent);
        if (!isNaN(price) && price > 0) {
          return { price, change24h };
        }
      }
    } catch (_) {}

    const cached = CF.Storage?.getPriceCache()?.data?.['internet-computer'];
    return {
      price: cached?.usd || 0,
      change24h: cached?.usd_24h_change ?? 0,
    };
  }

  /**
   * Fetch ICP balance from Rosetta API
   */
  async function fetchHoldings(source) {
    const rawAddr = (source.address || '').trim();
    if (!rawAddr) return [];

    const acctId = normalizeAddress(rawAddr);
    const { price: icpPrice, change24h: icpChange } = await getIcpPrice();

    let balance = 0;

    try {
      const res = await fetch(`${ROSETTA_URL}/account/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          network_identifier: NETWORK_IDENTIFIER,
          account_identifier: { address: acctId },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const balObj = (data.balances || []).find(b => b.currency?.symbol === 'ICP') || data.balances?.[0];
        if (balObj && balObj.value) {
          const decimals = balObj.currency?.decimals || 8;
          balance = Number(BigInt(balObj.value)) / Math.pow(10, decimals);
        }
      } else {
        // If 500 account not found (e.g. fresh account with 0 balance), treat as 0
        balance = 0;
      }
    } catch (err) {
      console.warn('ICP balance fetch error:', err);
    }

    return [{
      coingeckoId: 'internet-computer',
      symbol:      'ICP',
      name:        'Internet Computer',
      balance:     balance,
      chain:       'Internet Computer',
      chains:      ['Internet Computer'],
      price:       icpPrice,
      change24h:   icpChange,
      valueUSD:    icpPrice > 0 ? balance * icpPrice : 0,
      sourceName:  source.name || 'ICP Wallet',
      address:     acctId,
    }];
  }

  /**
   * Fetch transaction history for an ICP account from Rosetta API
   */
  async function fetchTransactions(source) {
    const rawAddr = (source.address || '').trim();
    if (!rawAddr) return [];

    const acctId = normalizeAddress(rawAddr);

    try {
      const res = await fetch(`${ROSETTA_URL}/search/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          network_identifier: NETWORK_IDENTIFIER,
          account_identifier: { address: acctId },
          limit: 25,
        }),
      });

      if (!res.ok) return [];
      const data = await res.json();
      const txs = data.transactions || [];

      return txs.map(item => {
        const tx = item.transaction || {};
        const hash = tx.transaction_identifier?.hash || '';
        const timestamp = item.block_identifier?.timestamp || Date.now();

        // Determine send or receive
        const myOp = (tx.operations || []).find(op => op.account?.address === acctId);
        const amountStr = myOp?.amount?.value || '0';
        const isSend = amountStr.startsWith('-');
        const val = Math.abs(Number(amountStr)) / 1e8;

        return {
          id: hash,
          hash: hash,
          chain: 'Internet Computer',
          type: isSend ? 'send' : 'receive',
          from: isSend ? acctId : 'External',
          to: isSend ? 'External' : acctId,
          amount: val,
          symbol: 'ICP',
          timestamp: typeof timestamp === 'number' ? Math.floor(timestamp / 1000) : Date.now(),
          status: 'confirmed',
          explorerUrl: `https://dashboard.internetcomputer.org/transaction/${hash}`,
        };
      });
    } catch (_) {
      return [];
    }
  }

  return {
    normalizeAddress,
    principalToAccountIdentifier,
    fetchHoldings,
    fetchTransactions,
  };
})();
