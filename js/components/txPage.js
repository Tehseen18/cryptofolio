/* ============================================================
   txPage.js — Transactions page renderer
   Shows multi-chain history, real-time P&L, filters & explorers
   ============================================================ */

window.CF = window.CF || {};

CF.TxPage = (() => {

  let filterSymbol = 'all';
  let filterType   = 'all';
  let filterChain  = 'all';
  let isAutoSyncing = false;

  function render() {
    const page = document.getElementById('page-transactions');
    if (!page) return;

    const txs     = CF.Transactions.getAll();
    const prices  = CF.Storage.getPriceCache()?.data || {};
    const sources = CF.Storage.getSources();
    const pnl     = CF.Transactions.calculatePnL(txs, prices);

    // If no transactions yet, but sources are connected, auto-sync once
    if (txs.length === 0 && sources.length > 0 && !isAutoSyncing) {
      isAutoSyncing = true;
      CF.App.syncTransactions(true).finally(() => {
        isAutoSyncing = false;
        render();
      });
    }

    // Filter lists
    const symbols = ['all', ...new Set(txs.map(t => t.symbol).filter(Boolean))].slice(0, 25);
    const chains  = ['all', ...new Set(txs.map(t => t.chain || t.network).filter(Boolean))];

    // Apply active filters
    let filtered = txs;
    if (filterSymbol !== 'all') filtered = filtered.filter(t => t.symbol === filterSymbol);
    if (filterType   !== 'all') filtered = filtered.filter(t => t.type   === filterType);
    if (filterChain  !== 'all') filtered = filtered.filter(t => (t.chain === filterChain || t.network === filterChain));

    page.innerHTML = `
      <!-- P&L Summary Cards -->
      <div class="stats-grid" style="margin-bottom:20px;">
        ${pnlCard('Realized P&L', pnl.totalRealized, 'From completed buys & sells')}
        ${pnlCard('Unrealized P&L', pnl.totalUnrealized, 'Based on current prices vs cost basis')}
        ${pnlCard('Total P&L', pnl.totalRealized + pnl.totalUnrealized, 'Combined portfolio performance')}
        <div class="stat-card">
          <div class="stat-label">Total Transactions</div>
          <div class="stat-value">${txs.length}</div>
          <div class="stat-sub">${filtered.length} shown (${sources.length} sources)</div>
        </div>
      </div>

      <!-- Filters & Actions Header -->
      <div class="section-header" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="section-title">Transaction History</span>
          <span style="font-size:11px;color:var(--text-3);">${filtered.length} records</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <select id="txFilterChain" style="width:auto;padding:6px 10px;font-size:12px;background:var(--card-bg);border:1px solid var(--border);border-radius:6px;color:var(--text-1);">
            ${chains.map(c => `<option value="${c}" ${filterChain===c?'selected':''}>${c === 'all' ? 'All Networks' : c}</option>`).join('')}
          </select>
          <select id="txFilterSymbol" style="width:auto;padding:6px 10px;font-size:12px;background:var(--card-bg);border:1px solid var(--border);border-radius:6px;color:var(--text-1);">
            ${symbols.map(s => `<option value="${s}" ${filterSymbol===s?'selected':''}>${s === 'all' ? 'All Assets' : s}</option>`).join('')}
          </select>
          <select id="txFilterType" style="width:auto;padding:6px 10px;font-size:12px;background:var(--card-bg);border:1px solid var(--border);border-radius:6px;color:var(--text-1);">
            <option value="all" ${filterType==='all'?'selected':''}>All Types</option>
            <option value="receive" ${filterType==='receive'?'selected':''}>Received</option>
            <option value="send"    ${filterType==='send'?'selected':''}>Sent</option>
            <option value="buy"     ${filterType==='buy'?'selected':''}>Bought</option>
            <option value="sell"    ${filterType==='sell'?'selected':''}>Sold</option>
          </select>
          <button class="btn-primary" id="syncTxBtn" style="padding:6px 14px;font-size:12px;cursor:pointer;">
            ${isAutoSyncing ? '⏳ Syncing…' : '↻ Sync History'}
          </button>
        </div>
      </div>

      <!-- Transaction List -->
      ${filtered.length === 0
        ? renderEmpty(txs.length, sources.length)
        : `<div class="table-wrap">
            <table>
              <thead><tr>
                <th>Date / Time</th>
                <th>Type</th>
                <th>Network</th>
                <th>Asset</th>
                <th>Amount</th>
                <th>Value (USD)</th>
                <th class="hide-mobile">Wallet / Source</th>
                <th style="text-align:right;">Explorer</th>
              </tr></thead>
              <tbody>
                ${filtered.slice(0, 200).map(tx => txRow(tx, prices)).join('')}
              </tbody>
            </table>
            ${filtered.length > 200 ? `
              <div style="padding:10px 14px;font-size:11px;color:var(--text-3);text-align:center;border-top:1px solid var(--border);">
                Showing 200 of ${filtered.length} transactions
              </div>` : ''}
          </div>`
      }
    `;

    // Bind filters & sync button
    page.querySelector('#txFilterChain')?.addEventListener('change', e => {
      filterChain = e.target.value;
      render();
    });
    page.querySelector('#txFilterSymbol')?.addEventListener('change', e => {
      filterSymbol = e.target.value;
      render();
    });
    page.querySelector('#txFilterType')?.addEventListener('change', e => {
      filterType = e.target.value;
      render();
    });
    page.querySelector('#syncTxBtn')?.addEventListener('click', async () => {
      const btn = page.querySelector('#syncTxBtn');
      if (btn) {
        btn.disabled    = true;
        btn.textContent = 'Syncing…';
      }
      await CF.App.syncTransactions();
      render();
      if (btn) {
        btn.disabled    = false;
        btn.textContent = '↻ Sync History';
      }
    });
  }

  function renderEmpty(totalTxs, totalSources) {
    if (totalSources === 0) {
      return `
        <div class="empty-state" style="padding:50px 20px;">
          <div class="empty-icon">◈</div>
          <div class="empty-title">No sources connected</div>
          <div class="empty-desc">Connect a wallet or exchange to start tracking your on-chain transaction history.</div>
          <button class="btn-primary" style="margin-top:14px;" onclick="CF.WalletModal.open()">+ Add Source</button>
        </div>
      `;
    }
    if (totalTxs === 0) {
      return `
        <div class="empty-state" style="padding:50px 20px;">
          <div class="empty-icon">⏳</div>
          <div class="empty-title">Syncing On-Chain Transactions…</div>
          <div class="empty-desc">Fetching transaction records from your ${totalSources} connected wallet(s).</div>
          <button class="btn-primary" style="margin-top:14px;" onclick="CF.App.syncTransactions().then(() => CF.TxPage.render())">↻ Sync Now</button>
        </div>
      `;
    }
    return `
      <div class="empty-state" style="padding:50px 20px;">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">No transactions match filters</div>
        <div class="empty-desc">Try resetting your filter selections.</div>
        <button class="btn-secondary" style="margin-top:14px;" onclick="CF.TxPage.resetFilters()">Reset Filters</button>
      </div>
    `;
  }

  function resetFilters() {
    filterSymbol = 'all';
    filterType   = 'all';
    filterChain  = 'all';
    render();
  }

  function pnlCard(label, value, sub) {
    const cls = value > 0 ? 'change-up' : value < 0 ? 'change-down' : '';
    return `
      <div class="stat-card">
        <div class="stat-label">${label}</div>
        <div class="stat-value ${cls}">${CF.fmt.currency(value)}</div>
        <div class="stat-sub">${sub}</div>
      </div>
    `;
  }

  const TYPE_LABELS = {
    receive: { label: 'Received', color: 'var(--green)' },
    send:    { label: 'Sent',     color: 'var(--red)' },
    buy:     { label: 'Bought',   color: 'var(--green)' },
    sell:    { label: 'Sold',     color: 'var(--red)' },
    swap:    { label: 'Swapped',  color: 'var(--accent)' },
  };

  function getExplorerUrl(tx) {
    if (tx.explorerUrl) return tx.explorerUrl;
    const hash = tx.txHash || tx.hash || '';
    if (!hash) return null;

    const net = (tx.network || tx.chain || '').toLowerCase();
    if (net.includes('bitcoin') || net === 'btc') return `https://mempool.space/tx/${hash}`;
    if (net.includes('solana')  || net === 'sol') return `https://solscan.io/tx/${hash}`;
    if (net.includes('doge'))                     return `https://dogechain.info/tx/${hash}`;
    if (net.includes('aptos'))                    return `https://explorer.aptoslabs.com/txn/${hash}?network=mainnet`;
    if (net.includes('internet')|| net === 'icp') return `https://dashboard.internetcomputer.org/transaction/${hash}`;
    if (net.includes('bsc')     || net === 'bnb') return `https://bscscan.com/tx/${hash}`;
    if (net.includes('base'))                     return `https://basescan.org/tx/${hash}`;
    if (net.includes('arbitrum'))                 return `https://arbiscan.io/tx/${hash}`;
    if (net.includes('optimism'))                 return `https://optimistic.etherscan.io/tx/${hash}`;
    if (net.includes('polygon'))                  return `https://polygonscan.com/tx/${hash}`;
    if (net.includes('stacks')  || net === 'stx') return `https://explorer.hiro.so/txid/${hash}`;
    if (net.includes('ton'))                      return `https://tonscan.org/tx/${hash}`;
    if (net.includes('near'))                     return `https://nearblocks.io/txns/${hash}`;

    return `https://etherscan.io/tx/${hash}`;
  }

  function txRow(tx, prices) {
    const d    = new Date(tx.date || Date.now());
    const meta = TYPE_LABELS[tx.type] || { label: tx.type, color: 'var(--text-2)' };
    const hash = tx.txHash || tx.hash || '';
    const shortHash = hash.length > 12 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash;

    // Estimate value if not explicit
    let unitPrice = tx.priceUSD;
    let totalVal  = tx.totalUSD;
    if (!unitPrice && !totalVal && tx.amount > 0) {
      const sym = (tx.symbol || '').toUpperCase();
      const cid = tx.coingeckoId || sym.toLowerCase();
      const live = (prices && (prices[cid]?.usd || prices[sym]?.usd)) || 0;
      if (live > 0) {
        totalVal = tx.amount * live;
      }
    } else if (unitPrice && !totalVal && tx.amount > 0) {
      totalVal = tx.amount * unitPrice;
    }

    const explorer = getExplorerUrl(tx);
    const chainLabel = tx.chain || tx.network || 'EVM';

    return `
      <tr>
        <td style="font-size:11px;color:var(--text-2);white-space:nowrap;">
          <div style="font-weight:500;color:var(--text-1);">${d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</div>
          <div style="font-size:10px;color:var(--text-3);font-family:monospace;">${d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' })}</div>
        </td>
        <td>
          <span class="badge" style="background:${meta.color}18;color:${meta.color};border:1px solid ${meta.color}33;">
            ${meta.label}
          </span>
        </td>
        <td>
          <span class="chain-badge-pill">${chainLabel}</span>
        </td>
        <td>
          <div style="font-weight:600;font-size:13px;color:var(--text-1);">${tx.symbol || 'COIN'}</div>
          <div style="font-size:11px;color:var(--text-3);">${tx.name || ''}</div>
        </td>
        <td class="mono" style="font-weight:500;">
          ${tx.amount > 0 ? CF.fmt.balance(tx.amount) : '—'}
        </td>
        <td style="font-weight:600;color:var(--text-1);">
          ${totalVal ? CF.fmt.currency(totalVal) : '<span style="color:var(--text-3)">—</span>'}
        </td>
        <td class="hide-mobile" style="font-size:11px;color:var(--text-3);">
          ${tx.sourceName || 'Wallet'}
        </td>
        <td style="text-align:right;">
          ${explorer && hash
            ? `<a href="${explorer}" target="_blank" rel="noopener"
                 style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--accent);text-decoration:none;"
                 title="${hash}">
                 ${shortHash} ↗
               </a>`
            : `<span style="font-size:11px;color:var(--text-3);font-family:'JetBrains Mono',monospace;">${shortHash || '—'}</span>`}
        </td>
      </tr>
    `;
  }

  return {
    render,
    resetFilters,
  };
})();
