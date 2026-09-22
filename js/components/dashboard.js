/* ============================================================
   dashboard.js — Dashboard page renderer
   ============================================================ */

window.CF = window.CF || {};

CF.Dashboard = (() => {

  /**
   * Main render entry point
   */
  function render(allHoldings, prices) {
    const page = document.getElementById('page-dashboard');
    if (!page) return;

    if (!allHoldings || allHoldings.length === 0) {
      renderEmpty(page);
      return;
    }

    // Aggregate: merge same coin across sources
    const aggregated = aggregateHoldings(allHoldings, prices);
    const total      = aggregated.reduce((s, h) => s + (h.valueUSD || 0), 0);
    const change24h  = computePortfolio24h(aggregated);

    page.innerHTML = `
      <!-- Stats -->
      <div class="stats-grid">
        ${statCard('Total Value', CF.fmt.currency(total), `${aggregated.length} assets`, true)}
        ${statCard('24h Change',
          `<span class="${CF.fmt.changeClass(change24h.pct)}">${CF.fmt.pct(change24h.pct)}</span>`,
          `${CF.fmt.changeClass(change24h.pct) === 'change-up' ? '+' : ''}${CF.fmt.currency(change24h.abs)} today`
        )}
        ${statCard('Sources', CF.Storage.getSources().length, 'connected')}
        ${bestPerformerCard(aggregated)}
      </div>

      <!-- Holdings Table -->
      <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:baseline;gap:8px;">
          <span class="section-title">Holdings</span>
          <span style="font-size:11px;color:var(--text-3);">${aggregated.length} tokens / assets</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <button
            class="btn-secondary"
            id="spamFilterBtn"
            onclick="CF.Dashboard.toggleHideSpam()"
            style="font-size:11px;padding:4px 10px;cursor:pointer;border-radius:6px;background:${CF.Storage.getSettings().hideSpam !== false ? 'rgba(74, 222, 128, 0.12)' : 'rgba(255,255,255,0.05)'};border:1px solid ${CF.Storage.getSettings().hideSpam !== false ? 'var(--green)' : 'var(--border)'};color:${CF.Storage.getSettings().hideSpam !== false ? 'var(--green)' : 'var(--text-3)'};"
            title="Automatically hide airdropped spam tokens without real liquidity"
          >
            ${CF.Storage.getSettings().hideSpam !== false ? '🛡️ Spam Filter: ON' : '🛡️ Spam Filter: OFF'}
          </button>
          ${CF.Storage.getHiddenTokens().length > 0 ? `
            <button
              class="btn-secondary"
              onclick="CF.Dashboard.openHiddenModal()"
              style="font-size:11px;padding:4px 10px;color:var(--text-2);cursor:pointer;border-radius:6px;"
              title="View or restore hidden tokens"
            >
              Hidden (${CF.Storage.getHiddenTokens().length})
            </button>
          ` : ''}
          <input
            type="text"
            id="tokenSearchInput"
            placeholder="Search tokens..."
            oninput="CF.Dashboard.filterHoldings(this.value)"
            style="background:var(--card-bg);border:1px solid var(--border);color:var(--text-1);border-radius:6px;padding:5px 12px;font-size:12px;outline:none;width:150px;"
          />
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Asset</th>
              <th class="hide-mobile">Network</th>
              <th class="hide-mobile">Balance</th>
              <th>Price</th>
              <th>24h</th>
              <th>Value</th>
              <th class="hide-mobile">Allocation</th>
              <th style="text-align:right;">Action</th>
            </tr>
          </thead>
          <tbody id="holdingsBody">
            ${aggregated.map((h, i) => holdingRow(h, i + 1, total)).join('')}
          </tbody>
        </table>
      </div>

      <!-- Charts -->
      <div class="charts-grid">
        <div class="chart-card donut-wrap">
          <div class="chart-card-title">Allocation</div>
          <div class="chart-container" style="width:160px;height:160px;">
            <canvas id="donutChart"></canvas>
          </div>
          <div class="chart-legend" id="donutLegend"></div>
        </div>
        <div class="chart-card">
          <div class="chart-card-title">Portfolio History</div>
          <div class="chart-container" style="height:180px;">
            <canvas id="historyChart"></canvas>
          </div>
          ${CF.Storage.getSnapshots().length < 2
            ? `<div style="font-size:11px;color:var(--text-3);text-align:center;margin-top:8px;">History builds up as you refresh daily.</div>`
            : ''}
        </div>
      </div>
    `;

    // Render charts after DOM is ready
    requestAnimationFrame(() => {
      CF.Charts.renderDonut(aggregated.filter(h => h.valueUSD > 0));
      CF.Charts.renderHistory(CF.Storage.getSnapshots());
    });
  }

  function renderEmpty(page) {
    CF.Charts.destroyAll();
    page.innerHTML = `
      <div class="empty-state" style="height:calc(100vh - 120px);">
        <div class="empty-icon">◈</div>
        <div class="empty-title">No sources connected</div>
        <div class="empty-desc">Add a wallet address or exchange to start tracking your crypto portfolio.</div>
        <button class="btn-primary" style="margin-top:12px;" onclick="CF.WalletModal.open()">
          + Add Your First Source
        </button>
      </div>
    `;
  }

  // ── Helpers ────────────────────────────────────────────────

  function statCard(label, value, sub, accent = false) {
    return `
      <div class="stat-card ${accent ? 'accent' : ''}">
        <div class="stat-label">${label}</div>
        <div class="stat-value">${value}</div>
        <div class="stat-sub">${sub}</div>
      </div>
    `;
  }

  function bestPerformerCard(holdings) {
    const sorted = holdings.filter(h => h.change24h != null).sort((a, b) => b.change24h - a.change24h);
    const best   = sorted[0];
    if (!best) return statCard('Best Performer', '—', 'No data yet');
    return statCard(
      'Best Performer',
      `<span class="${CF.fmt.changeClass(best.change24h)}">${best.symbol}</span>`,
      CF.fmt.pct(best.change24h)
    );
  }

  function holdingRow(h, rank, total) {
    const alloc    = total > 0 ? ((h.valueUSD || 0) / total * 100) : 0;
    const imgEl    = h.image
      ? `<img src="${h.image}" alt="${h.symbol}" loading="lazy" />`
      : `<span style="font-size:10px;font-weight:700;">${h.symbol.slice(0,3)}</span>`;

    const rowId = 'row-' + (h.symbol || 'coin').replace(/[^a-zA-Z0-9_-]/g, '') + '-' + rank;
    const breakdown = h.breakdown || [];
    const hasMultiple = breakdown.length > 1;

    let networkBadge = '';
    if (hasMultiple) {
      networkBadge = `
        <button
          id="btn-toggle-${rowId}"
          class="breakdown-toggle-btn"
          onclick="event.stopPropagation(); CF.Dashboard.toggleBreakdown('${rowId}')"
          title="Click to view holdings across ${breakdown.length} chains"
        >
          <span class="multi-indicator">🌐 ${breakdown.length} Chains</span>
          <span class="toggle-arrow">▼</span>
        </button>
      `;
    } else {
      const singleChain = breakdown[0]?.chain || h.chain || '—';
      networkBadge = `
        <button
          id="btn-toggle-${rowId}"
          class="breakdown-toggle-btn single-chain"
          onclick="event.stopPropagation(); CF.Dashboard.toggleBreakdown('${rowId}')"
          title="Click to view wallet details"
        >
          <span>${singleChain}</span>
          <span class="toggle-arrow" style="font-size:9px;opacity:0.6;">▾</span>
        </button>
      `;
    }

    return `
      <tr
        class="holding-row ${hasMultiple ? 'is-multi-chain' : ''}"
        id="main-${rowId}"
        data-symbol="${(h.symbol || '').toLowerCase()}"
        data-name="${(h.name || '').toLowerCase()}"
        onclick="CF.Dashboard.toggleBreakdown('${rowId}')"
        style="cursor:pointer;"
        title="Click to expand chain breakdown"
      >
        <td style="color:var(--text-3);font-size:12px;">${rank}</td>
        <td>
          <div class="coin-cell">
            <div class="coin-icon">${imgEl}</div>
            <div>
              <div class="coin-name" style="display:flex;align-items:center;gap:6px;">
                <span>${h.symbol}</span>
                ${hasMultiple ? `<span class="badge-multi-chain">${breakdown.length} chains</span>` : ''}
              </div>
              <div class="coin-symbol">${h.name}</div>
            </div>
          </div>
        </td>
        <td class="hide-mobile">
          ${networkBadge}
        </td>
        <td class="mono hide-mobile">${CF.fmt.balance(h.balance)}</td>
        <td>${h.price ? CF.fmt.currency(h.price) : '—'}</td>
        <td>${CF.fmt.changeDisplay(h.change24h)}</td>
        <td style="font-weight:600;">${h.valueUSD ? CF.fmt.currency(h.valueUSD) : '—'}</td>
        <td class="hide-mobile">
          <div class="alloc-bar-wrap">
            <div class="alloc-bar">
              <div class="alloc-bar-fill" style="width:${Math.min(alloc, 100)}%"></div>
            </div>
            <span class="alloc-pct">${alloc > 0 ? alloc.toFixed(1) + '%' : '—'}</span>
          </div>
        </td>
        <td style="text-align:right;" onclick="event.stopPropagation();">
          <button
            class="btn-ghost"
            title="Hide this token / scam from portfolio"
            style="font-size:11px;padding:3px 8px;border-radius:4px;color:var(--text-3);border:1px solid transparent;cursor:pointer;"
            onmouseover="this.style.borderColor='var(--border)';this.style.color='var(--red)';"
            onmouseout="this.style.borderColor='transparent';this.style.color='var(--text-3)';"
            onclick="CF.Dashboard.hideTokenAction('${h.symbol}')"
          >
            ⊘ Hide
          </button>
        </td>
      </tr>
      <tr class="breakdown-row" id="breakdown-${rowId}" data-parent-row="main-${rowId}" style="display:none;">
        <td colspan="9" style="padding:0;border-bottom:1px solid var(--border);">
          <div class="breakdown-wrapper">
            <div class="breakdown-top">
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="breakdown-icon">⛓️</span>
                <span style="font-size:12px;font-weight:600;color:var(--text-1);">
                  ${h.symbol} Holdings by Network / Chain
                </span>
              </div>
              <span style="font-size:11px;color:var(--text-3);">
                Total: <b>${CF.fmt.balance(h.balance)} ${h.symbol}</b> (${h.valueUSD ? CF.fmt.currency(h.valueUSD) : '—'})
              </span>
            </div>
            <table class="breakdown-table">
              <thead>
                <tr>
                  <th>Chain / Network</th>
                  <th>Amount</th>
                  <th>Value (USD)</th>
                  <th>Share</th>
                  <th class="hide-mobile">Wallet / Source</th>
                </tr>
              </thead>
              <tbody>
                ${breakdown.map(b => {
                  const share = (h.valueUSD > 0 && b.valueUSD > 0)
                    ? ((b.valueUSD / h.valueUSD) * 100).toFixed(1) + '%'
                    : ((h.balance > 0 ? (b.balance / h.balance * 100).toFixed(1) : 0) + '%');
                  return `
                    <tr>
                      <td>
                        <span class="chain-badge-pill">${b.chain}</span>
                      </td>
                      <td class="mono" style="font-weight:500;color:var(--text-1);">
                        ${CF.fmt.balance(b.balance)} <span style="font-size:10px;color:var(--text-3);">${h.symbol}</span>
                      </td>
                      <td style="font-weight:600;color:var(--text-1);">
                        ${b.valueUSD ? CF.fmt.currency(b.valueUSD) : '—'}
                      </td>
                      <td style="color:var(--text-2);font-size:12px;">
                        ${share}
                      </td>
                      <td class="hide-mobile" style="color:var(--text-3);font-size:11px;">
                        ${b.sources || '—'}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </td>
      </tr>
    `;
  }

  /**
   * Filter holdings table rows by search query
   */
  function filterHoldings(query) {
    const q = (query || '').toLowerCase().trim();
    const rows = document.querySelectorAll('.holding-row');
    rows.forEach(r => {
      const sym  = r.dataset.symbol || '';
      const name = r.dataset.name   || '';
      const show = !q || sym.includes(q) || name.includes(q);
      r.style.display = show ? '' : 'none';
      const breakdownRow = document.getElementById(r.id.replace('main-', 'breakdown-'));
      if (breakdownRow && !show) {
        breakdownRow.style.display = 'none';
      }
    });
  }

  function toggleBreakdown(rowId) {
    const bRow = document.getElementById(`breakdown-${rowId}`);
    const btn = document.getElementById(`btn-toggle-${rowId}`);
    const mainRow = document.getElementById(`main-${rowId}`);
    if (!bRow) return;
    const isHidden = bRow.style.display === 'none';
    bRow.style.display = isHidden ? 'table-row' : 'none';
    if (btn) {
      const arrow = btn.querySelector('.toggle-arrow');
      if (arrow) arrow.textContent = isHidden ? '▲' : (btn.classList.contains('single-chain') ? '▾' : '▼');
      btn.classList.toggle('active', isHidden);
    }
    if (mainRow) {
      mainRow.classList.toggle('expanded', isHidden);
    }
  }

  function hideTokenAction(symbol) {
    if (!symbol) return;
    CF.Storage.hideToken(symbol);
    CF.Notify.info(`Hidden "${symbol}". You can restore it in Settings or via Hidden button.`);
    CF.App.renderCurrentPage();
  }

  function toggleHideSpam() {
    const current = CF.Storage.getSettings().hideSpam !== false;
    CF.Storage.saveSettings({ hideSpam: !current });
    CF.Notify.info(!current ? '🛡️ Spam filter enabled' : 'Spam filter disabled (all airdrops visible)');
    CF.App.renderCurrentPage();
  }

  function openHiddenModal() {
    const hidden = CF.Storage.getHiddenTokens();
    if (hidden.length === 0) {
      CF.Notify.info('No hidden tokens.');
      return;
    }
    const list = hidden.map(sym => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);">
        <span style="font-weight:600;font-family:monospace;">${sym}</span>
        <button class="btn-secondary" style="font-size:11px;padding:3px 10px;cursor:pointer;" onclick="CF.Storage.unhideToken('${sym}'); CF.Dashboard.openHiddenModal(); CF.App.renderCurrentPage();">Restore</button>
      </div>
    `).join('');

    const existing = document.getElementById('hiddenTokensModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop active';
    modal.id = 'hiddenTokensModal';
    modal.innerHTML = `
      <div class="modal-card" style="max-width:440px;">
        <div class="modal-header">
          <div class="modal-title">Hidden Tokens (${hidden.length})</div>
          <button class="modal-close" onclick="document.getElementById('hiddenTokensModal').remove()">✕</button>
        </div>
        <div style="font-size:12px;color:var(--text-3);margin-bottom:10px;">
          These tokens are hidden from your portfolio totals and holdings list:
        </div>
        <div style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);">
          ${list}
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:16px;">
          <button class="btn-danger" style="font-size:12px;padding:6px 12px;cursor:pointer;" onclick="CF.Storage.unhideAllTokens(); document.getElementById('hiddenTokensModal').remove(); CF.App.renderCurrentPage(); CF.Notify.success('All tokens restored');">Restore All</button>
          <button class="btn-primary" style="font-size:12px;padding:6px 16px;cursor:pointer;" onclick="document.getElementById('hiddenTokensModal').remove()">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const CANONICAL_CROSS_CHAIN_COINS = {
    'ETH':   { name: 'Ethereum', symbol: 'ETH', cgId: 'ethereum' },
    'WETH':  { name: 'Wrapped Ether', symbol: 'WETH', cgId: 'weth' },
    'USDC':  { name: 'USD Coin', symbol: 'USDC', cgId: 'usd-coin' },
    'USDT':  { name: 'Tether USD', symbol: 'USDT', cgId: 'tether' },
    'DAI':   { name: 'Dai', symbol: 'DAI', cgId: 'dai' },
    'WBTC':  { name: 'Wrapped BTC', symbol: 'WBTC', cgId: 'wrapped-bitcoin' },
    'BTCB':  { name: 'Bitcoin BEP2', symbol: 'BTCB', cgId: 'bitcoin' },
    'BTC':   { name: 'Bitcoin', symbol: 'BTC', cgId: 'bitcoin' },
    'BNB':   { name: 'BNB', symbol: 'BNB', cgId: 'binancecoin' },
    'WBNB':  { name: 'Wrapped BNB', symbol: 'WBNB', cgId: 'wbnb' },
    'POL':   { name: 'Polygon', symbol: 'POL', cgId: 'matic-network' },
    'MATIC': { name: 'Polygon (MATIC)', symbol: 'MATIC', cgId: 'matic-network' },
    'AVAX':  { name: 'Avalanche', symbol: 'AVAX', cgId: 'avalanche-2' },
    'SOL':   { name: 'Solana', symbol: 'SOL', cgId: 'solana' },
    'LINK':  { name: 'Chainlink', symbol: 'LINK', cgId: 'chainlink' },
    'UNI':   { name: 'Uniswap', symbol: 'UNI', cgId: 'uniswap' },
    'AAVE':  { name: 'Aave', symbol: 'AAVE', cgId: 'aave' },
    'ARB':   { name: 'Arbitrum', symbol: 'ARB', cgId: 'arbitrum' },
    'OP':    { name: 'Optimism', symbol: 'OP', cgId: 'optimism' },
    'NEAR':  { name: 'NEAR Protocol', symbol: 'NEAR', cgId: 'near' },
    'APT':   { name: 'Aptos', symbol: 'APT', cgId: 'aptos' },
    'ICP':   { name: 'Internet Computer', symbol: 'ICP', cgId: 'internet-computer' },
    'DOGE':  { name: 'Dogecoin', symbol: 'DOGE', cgId: 'dogecoin' },
    'ATOM':  { name: 'Cosmos Hub', symbol: 'ATOM', cgId: 'cosmos' },
    'SEI':   { name: 'Sei Network', symbol: 'SEI', cgId: 'sei-network' },
    'OSMO':  { name: 'Osmosis', symbol: 'OSMO', cgId: 'osmosis' },
    'STX':   { name: 'Stacks', symbol: 'STX', cgId: 'blockstack' },
    'TON':   { name: 'Toncoin', symbol: 'TON', cgId: 'the-open-network' },
    'INJ':   { name: 'Injective', symbol: 'INJ', cgId: 'injective-protocol' },
  };

  function isCanonicalHolding(h) {
    const sym = (h.symbol || '').trim().toUpperCase();
    if (!CANONICAL_CROSS_CHAIN_COINS[sym]) return false;

    // Native coins (ETH, BNB, POL, AVAX, BTC, SOL, DOGE, NEAR, APT, ICP, etc.)
    const nativeCoins = new Set(['ETH', 'BNB', 'POL', 'MATIC', 'AVAX', 'BTC', 'SOL', 'DOGE', 'NEAR', 'APT', 'ICP', 'ATOM', 'SEI', 'OSMO', 'STX', 'TON', 'INJ']);
    if (nativeCoins.has(sym)) {
      // Must be genuine native gas coin or non-contract wallet balance
      return h.isNative === true || (!h.contract && !h.isSpam);
    }

    // Wrapped canonical tokens (WETH, WBTC, WBNB)
    if (sym === 'WETH' || sym === 'WBTC' || sym === 'WBNB') {
      return h.isCore === true && !h.isSpam;
    }

    // Canonical stables (USDC, USDT, DAI)
    if (sym === 'USDC' || sym === 'USDT' || sym === 'DAI') {
      return h.isCore === true && !h.isSpam;
    }

    // Other canonical DeFi bluechips (LINK, UNI, AAVE, ARB, OP)
    return h.isCore === true && !h.isSpam;
  }

  /**
   * Merge holdings from all sources, sum balances, attach prices
   */
  function aggregateHoldings(allHoldings, prices) {
    const map = {};

    allHoldings.forEach(h => {
      const sym = (h.symbol || '').trim();
      if (!sym) return;
      const upSym = sym.toUpperCase();

      // Only genuine canonical cross-chain coins merge across networks
      const isCanonical = isCanonicalHolding(h);

      let key;
      if (isCanonical) {
        key = 'CANONICAL:' + upSym;
      } else {
        const chainKey = (h.chain || (h.chains && h.chains[0]) || 'unknown').toLowerCase();
        const contractKey = (h.contract || h.coingeckoId || sym).toLowerCase();
        key = `${chainKey}:${contractKey}`;
      }

      if (!map[key]) {
        map[key] = {
          ...h,
          symbol: isCanonical ? upSym : h.symbol,
          name: isCanonical ? (CANONICAL_CROSS_CHAIN_COINS[upSym].name || h.name) : h.name,
          coingeckoId: isCanonical ? (CANONICAL_CROSS_CHAIN_COINS[upSym].cgId || h.coingeckoId) : h.coingeckoId,
          balance: 0,
          valueUSD: 0,
          chains: [...(h.chains || (h.chain ? [h.chain] : []))],
          rawItems: [],
        };
      } else {
        (h.chains || (h.chain ? [h.chain] : [])).forEach(c => {
          if (!map[key].chains.includes(c)) map[key].chains.push(c);
        });
      }

      const bal = h.balance || 0;
      const price = typeof h.price === 'number' && h.price > 0 ? h.price : 0;
      const itemVal = typeof h.valueUSD === 'number' && h.valueUSD > 0 ? h.valueUSD : bal * price;

      map[key].balance += bal;
      map[key].valueUSD += itemVal;

      if (price > 0 && (!map[key].price || map[key].price <= 0)) {
        map[key].price = price;
        map[key].change24h = h.change24h;
      }

      map[key].rawItems.push({
        chain: h.chain || (h.chains && h.chains[0]) || 'Unknown',
        balance: bal,
        price: price,
        valueUSD: itemVal,
        sourceName: h.sourceName || '',
        address: h.address || '',
      });
    });

    // Attach prices and finalize values
    return Object.values(map).map(h => {
      const isCanonical = isCanonicalHolding(h);
      const pd = (h.coingeckoId && prices[h.coingeckoId]);

      if (pd && pd.usd > 0) {
        h.price     = pd.usd;
        h.change24h = pd.usd_24h_change ?? h.change24h ?? null;
        h.image     = pd.image || h.image || null;
        h.valueUSD  = h.balance * h.price;
        h.marketCap = pd.market_cap || null;
      } else if (h.valueUSD > 0) {
        // Keep exact aggregated valueUSD from individual asset values
        if (!h.price || h.price <= 0) {
          h.price = h.balance > 0 ? h.valueUSD / h.balance : 0;
        }
      } else if (h.price && h.price > 0) {
        h.valueUSD = h.balance * h.price;
      } else {
        h.valueUSD = 0;
      }

      // Group rawItems by chain for the breakdown
      const chainGroups = {};
      (h.rawItems || []).forEach(item => {
        const cName = item.chain || 'Unknown';
        if (!chainGroups[cName]) {
          chainGroups[cName] = {
            chain: cName,
            balance: 0,
            valueUSD: 0,
            sources: new Set(),
          };
        }
        chainGroups[cName].balance += (item.balance || 0);
        chainGroups[cName].valueUSD += (item.valueUSD || 0);
        if (item.sourceName) chainGroups[cName].sources.add(item.sourceName);
      });

      h.breakdown = Object.values(chainGroups).map(bg => {
        const val = (h.price && h.price > 0 && isCanonical) ? bg.balance * h.price : bg.valueUSD;
        return {
          chain: bg.chain,
          balance: bg.balance,
          price: (h.price && isCanonical) ? h.price : (bg.balance > 0 ? bg.valueUSD / bg.balance : 0),
          valueUSD: val,
          sources: Array.from(bg.sources).join(', ')
        };
      }).sort((a, b) => (b.valueUSD || 0) - (a.valueUSD || 0) || (b.balance || 0) - (a.balance || 0));

      return h;
    }).sort((a, b) => {
      if ((b.valueUSD || 0) !== (a.valueUSD || 0)) {
        return (b.valueUSD || 0) - (a.valueUSD || 0);
      }
      return (b.balance || 0) - (a.balance || 0);
    });
  }

  function isCanonical(h) {
    const up = (h.symbol || '').toUpperCase();
    return !!CANONICAL_CROSS_CHAIN_COINS[up];
  }

  function computePortfolio24h(holdings) {
    let currentTotal = 0;
    let prevTotal    = 0;
    holdings.forEach(h => {
      const val  = h.valueUSD || 0;
      const chg  = h.change24h || 0;
      const prev = chg !== 0 ? val / (1 + chg / 100) : val;
      currentTotal += val;
      prevTotal    += prev;
    });
    const abs = currentTotal - prevTotal;
    const pct = prevTotal > 0 ? (abs / prevTotal) * 100 : 0;
    return { abs, pct };
  }

  // ── Sources Page ───────────────────────────────────────────

  function renderSources() {
    const page    = document.getElementById('page-sources');
    const sources = CF.Storage.getSources();

    page.innerHTML = `
      <div class="section-header" style="margin-bottom:16px;">
        <span class="section-title">Connected Sources</span>
        <button class="btn-primary" onclick="CF.WalletModal.open()">+ Add Source</button>
      </div>
      ${sources.length === 0
        ? `<div class="empty-state" style="height:300px;">
            <div class="empty-icon">⬡</div>
            <div class="empty-title">No sources yet</div>
            <div class="empty-desc">Connect wallets or exchanges to track your portfolio.</div>
          </div>`
        : `<div class="sources-grid">${sources.map(sourceCard).join('')}</div>`
      }
    `;

    // Bind delete / refresh buttons
    page.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm(`Remove "${btn.dataset.name}"? This can't be undone.`)) {
          CF.Storage.removeSource(btn.dataset.delete);
          CF.Notify.success('Source removed');
          renderSources();
          CF.App.renderCurrentPage();
        }
      });
    });

    page.querySelectorAll('[data-refresh]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '…';
        try {
          await CF.App.fetchSourceHoldings(btn.dataset.refresh);
          const updatedSrc = CF.Storage.getSourceById(btn.dataset.refresh);
          renderSources();
          CF.App.renderCurrentPage();
          if (updatedSrc?.status === 'error') {
            CF.Notify.error(`Sync error: ${updatedSrc.lastError}`, 7000);
          } else {
            const count = (updatedSrc?.holdings || []).length;
            const totalVal = (updatedSrc?.holdings || []).reduce((sum, h) => sum + (h.valueUSD || 0), 0);
            CF.Notify.success(`${updatedSrc?.name || 'Source'} synced: ${count} asset${count !== 1 ? 's' : ''} (${CF.fmt.currency(totalVal)})`);
          }
        } catch (e) {
          CF.Notify.error('Refresh failed: ' + e.message);
        } finally {
          btn.disabled = false;
          btn.textContent = '↻';
        }
      });
    });
  }

  function sourceCard(s) {
    const network  = CF.NETWORKS[s.network] || CF.EXCHANGE_TYPES[s.network] || {};
    const icon     = network.icon || '◈';
    const color    = network.color || '#6b7a99';
    const value    = (s.holdings || []).reduce((sum, h) => sum + (h.valueUSD || 0), 0);
    const statusDot= s.status === 'ok' ? 'ok' : s.status === 'error' ? 'err' : 'pending';
    const noteHold = (s.holdings || []).find(h => h.note);

    return `
      <div class="source-card">
        <div class="source-card-header">
          <div class="source-info">
            <div class="source-icon" style="color:${color}">${icon}</div>
            <div>
              <div class="source-name">${s.name}</div>
              <div class="source-type">
                <span class="status-dot ${statusDot}"></span>
                ${s.type === 'wallet' ? (CF.NETWORKS[s.network]?.name || s.network) : s.network}
              </div>
            </div>
          </div>
          <div class="source-actions">
            <button class="icon-btn" data-refresh="${s.id}" title="Refresh">↻</button>
            <button class="icon-btn" data-delete="${s.id}" data-name="${s.name}" title="Remove" style="color:var(--red)">✕</button>
          </div>
        </div>

        ${s.address ? `<div class="source-address" title="${s.address}">${s.address}</div>` : ''}

        <div class="source-stats">
          <div class="source-stat">
            <div class="source-stat-label">Value</div>
            <div class="source-stat-value">${value > 0 ? CF.fmt.currency(value) : '—'}</div>
          </div>
          <div class="source-stat">
            <div class="source-stat-label">Assets</div>
            <div class="source-stat-value">${(s.holdings || []).length}</div>
          </div>
          <div class="source-stat">
            <div class="source-stat-label">Synced</div>
            <div class="source-stat-value" style="font-size:12px;">${CF.fmt.timeAgo(s.syncedAt)}</div>
          </div>
        </div>

        ${s.lastError ? `
          <div style="margin-top:10px;padding:8px 10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:6px;font-size:11px;color:var(--red);">
            ⚠ ${s.lastError}
          </div>
        ` : ''}

        ${noteHold?.note ? `
          <div style="margin-top:10px;padding:8px 10px;background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.25);border-radius:6px;font-size:11px;color:#eab308;line-height:1.4;">
            ℹ ${noteHold.note}
          </div>
        ` : ''}
      </div>
    `;
  }

  // ── Settings Page ──────────────────────────────────────────

  function renderSettings() {
    const page     = document.getElementById('page-settings');
    const settings = CF.Storage.getSettings();

    page.innerHTML = `
      <!-- API Keys -->
      <div class="settings-section">
        <div class="settings-section-header">
          <div class="settings-section-title">API Keys</div>
          <div class="settings-section-desc">Free keys from block explorers — stored only in your browser</div>
        </div>
        ${apiKeyRow('Etherscan Key', 'etherscanKey', settings.etherscanKey, 'etherscan.io → My Account → API Keys')}
        ${apiKeyRow('BSCScan Key',   'bscscanKey',   settings.bscscanKey,   'bscscan.com → My Account → API Keys')}
        ${apiKeyRow('Polygonscan Key','polygonscanKey',settings.polygonscanKey,'polygonscan.com → My Account → API Keys')}
        ${apiKeyRow('Snowtrace Key', 'snowtraceKey',  settings.snowtraceKey,  'snowtrace.io → My Account → API Keys')}
        ${apiKeyRow('Proxy URL',     'proxyUrl',      settings.proxyUrl,      'Local Binance proxy (default: http://localhost:3131)')}
      </div>

      <!-- Preferences -->
      <div class="settings-section">
        <div class="settings-section-header">
          <div class="settings-section-title">Preferences</div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Currency</div>
            <div class="settings-row-desc">Display currency for portfolio values</div>
          </div>
          <div class="settings-row-control">
            <select id="setCurrency">
              ${Object.entries(CF.CURRENCIES).map(([k,v]) =>
                `<option value="${k}" ${settings.currency === k ? 'selected' : ''}>${v.symbol} ${k} — ${v.name}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Auto-refresh Interval</div>
            <div class="settings-row-desc">How often to refresh prices</div>
          </div>
          <div class="settings-row-control">
            <select id="setRefresh">
              ${Object.entries(CF.REFRESH_INTERVALS).map(([k,v]) =>
                `<option value="${k}" ${settings.refreshInterval == k ? 'selected' : ''}>${v}</option>`
              ).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- Spam & Hidden Tokens -->
      <div class="settings-section">
        <div class="settings-section-header">
          <div class="settings-section-title">Spam & Airdrop Protection</div>
          <div class="settings-section-desc">Keep your portfolio free from phishing tokens and fake pool valuations</div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Auto-hide Spam & Phishing Airdrops</div>
            <div class="settings-row-desc">Automatically hides scam airdrop names and unverified illiquid pools</div>
          </div>
          <div class="settings-row-control">
            <input type="checkbox" id="setHideSpam" ${settings.hideSpam !== false ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer;" />
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Manually Hidden Tokens (${CF.Storage.getHiddenTokens().length})</div>
            <div class="settings-row-desc">${CF.Storage.getHiddenTokens().length > 0 ? CF.Storage.getHiddenTokens().join(', ') : 'No manually hidden tokens.'}</div>
          </div>
          <div class="settings-row-control">
            ${CF.Storage.getHiddenTokens().length > 0 ? `
              <button class="btn-danger" style="font-size:11px;padding:4px 10px;cursor:pointer;" onclick="CF.Storage.unhideAllTokens(); CF.Dashboard.renderSettings(); CF.App.renderCurrentPage(); CF.Notify.success('All tokens unhidden');">
                Unhide All
              </button>
            ` : '<span style="font-size:12px;color:var(--text-3);">None</span>'}
          </div>
        </div>
      </div>

      <!-- Data Management -->
      <div class="settings-section">
        <div class="settings-section-header">
          <div class="settings-section-title">Data Management</div>
          <div class="settings-section-desc">All data is stored locally in your browser</div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Export Portfolio</div>
            <div class="settings-row-desc">Download your data (backup or transfer to GitHub Pages)</div>
          </div>
          <div class="settings-row-control" style="display:flex;gap:8px;">
            <button class="btn-secondary" onclick="CF.Storage.exportJSON()">Export JSON</button>
            <button class="btn-secondary" onclick="CF.Storage.exportCSV()">CSV</button>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Import / Transfer Data</div>
            <div class="settings-row-desc">Instantly load all your wallets and settings from a JSON file</div>
          </div>
          <div class="settings-row-control" style="display:flex;gap:8px;">
            <input type="file" id="importFileInput" accept=".json" style="display:none;" onchange="CF.Dashboard.handleImportFile(event)" />
            <button class="btn-primary" onclick="document.getElementById('importFileInput').click()">↑ Import JSON File</button>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Clear All Data</div>
            <div class="settings-row-desc">Remove all sources, API keys, and history</div>
          </div>
          <div class="settings-row-control">
            <button class="btn-danger" id="clearAllBtn">Clear Everything</button>
          </div>
        </div>
      </div>
    `;

    // Bind saves for API key inputs — save on EVERY keystroke (input event)
    page.querySelectorAll('[data-setting]').forEach(input => {
      let saveTimer = null;
      const doSave = () => {
        CF.Storage.saveSettings({ [input.dataset.setting]: input.value.trim() });
        // Show tiny green dot on the input
        input.style.borderColor = 'var(--green)';
        setTimeout(() => { input.style.borderColor = ''; }, 1500);
      };
      input.addEventListener('input', () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(doSave, 600); // debounce 600ms
      });
      input.addEventListener('change', doSave); // also on blur
      input.addEventListener('paste', () => setTimeout(doSave, 0)); // handle paste
    });

    page.querySelector('#setCurrency')?.addEventListener('change', e => {
      CF.Storage.saveSettings({ currency: e.target.value });
      CF.Notify.success('Currency updated — refresh to apply');
    });

    page.querySelector('#setRefresh')?.addEventListener('change', e => {
      CF.Storage.saveSettings({ refreshInterval: parseInt(e.target.value) });
      CF.App.restartRefreshTimer();
      CF.Notify.success('Refresh interval updated');
    });

    page.querySelector('#setHideSpam')?.addEventListener('change', e => {
      CF.Storage.saveSettings({ hideSpam: e.target.checked });
      CF.App.renderCurrentPage();
      CF.Notify.success(e.target.checked ? 'Spam filter enabled' : 'Spam filter disabled');
    });

    page.querySelector('#clearAllBtn')?.addEventListener('click', () => {
      if (confirm('This will delete ALL your data including wallets, API keys, and history. Are you sure?')) {
        CF.Storage.clearAll();
        CF.Charts.destroyAll();
        CF.App.renderCurrentPage();
        CF.Notify.success('All data cleared');
        setTimeout(() => location.reload(), 800);
      }
    });
  }

  function apiKeyRow(label, key, value, hint) {
    const uid = `key_${key}`;
    const hasValue = !!(value && value.trim());
    return `
      <div class="settings-row">
        <div>
          <div class="settings-row-label">
            ${label}
            ${hasValue ? '<span class="badge badge-green" style="margin-left:6px;">✓ Set</span>' : ''}
          </div>
          <div class="settings-row-desc">${hint}</div>
        </div>
        <div class="settings-row-control" style="display:flex;gap:6px;align-items:center;">
          <input
            type="text"
            id="${uid}"
            data-setting="${key}"
            value="${value || ''}"
            placeholder="Paste key here…"
            autocomplete="off"
            spellcheck="false"
            style="width:220px;font-family:'JetBrains Mono',monospace;font-size:11px;"
          />
        </div>
      </div>
    `;
  }

  function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const res = CF.Storage.importJSON(evt.target.result);
        if (res.success) {
          CF.Notify.success(`Imported ${res.count} wallet source(s)! Total: ${res.total}`);
          await CF.App.refreshAll();
          renderSettings();
          CF.App.renderCurrentPage();
        } else {
          CF.Notify.error(`Import failed: ${res.error}`);
        }
      } catch (err) {
        CF.Notify.error(`Import error: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  return {
    render,
    renderSources,
    renderSettings,
    aggregateHoldings,
    filterHoldings,
    toggleBreakdown,
    toggleHideSpam,
    hideTokenAction,
    openHiddenModal,
    handleImportFile,
  };
})();
