/* ============================================================
   app.js — Main application orchestrator
   ============================================================ */

window.CF = window.CF || {};

CF.App = (() => {
  let refreshTimer = null;
  let currentPage  = 'dashboard';
  let isRefreshing = false;

  const PAGE_TITLES = {
    dashboard:    'Dashboard',
    sources:      'Sources',
    transactions: 'Transactions',
    settings:     'Settings',
  };

  let priceTimer   = null;

  // ── Boot ───────────────────────────────────────────────────

  async function init() {
    setupNav();
    setupListeners();

    const hash = location.hash.replace('#', '') || 'dashboard';
    navigateTo(Object.keys(PAGE_TITLES).includes(hash) ? hash : 'dashboard');

    // 1. Instant real-time price update
    await refreshPrices();
    renderCurrentPage();

    // 2. Full blockchain balance refresh
    await refreshAll();

    // 3. Real-time timers
    startPricePolling();
    startRefreshTimer();
  }

  // ── Navigation ─────────────────────────────────────────────

  function setupNav() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        navigateTo(item.dataset.page);
      });
    });
  }

  function navigateTo(page) {
    currentPage   = page;
    location.hash = page;

    document.querySelectorAll('.nav-item').forEach(item =>
      item.classList.toggle('active', item.dataset.page === page)
    );
    document.querySelectorAll('.page').forEach(p =>
      p.classList.toggle('active', p.id === `page-${page}`)
    );

    document.getElementById('pageTitle').textContent = PAGE_TITLES[page] || page;
    renderCurrentPage();

    if (page === 'transactions') {
      const existing = CF.Transactions.getAll();
      if (existing.length === 0 && CF.Storage.getSources().length > 0) {
        syncTransactions(true);
      }
    }
  }

  function resolveHoldingPrice(h, prices, isSolana) {
    const symUpper = (h.symbol || '').toUpperCase().trim();
    const contract = (h.contract || '').trim();
    const contractLower = contract.toLowerCase();

    // Auto-sanitize Solana BABY token to prevent false-positive Binance BABY ($0.012)
    if ((symUpper === 'BABY' || h.name === 'Baby Samo Coin') && (isSolana || contract === 'Uuc6hiKT9Y6ASoqs2phonGGw2LAtecfJu9yEohppzWH')) {
      h.coingeckoId = 'baby-samo-coin';
      if (typeof h.price === 'number' && h.price > 0.0001) {
        h.price = 0.000002005;
        h.valueUSD = (h.balance || 0) * h.price;
      }
    }

    const CANONICAL_SOL_SYMBOLS = new Set([
      'SOL', 'JUP', 'RAY', 'BONK', 'WIF', 'PYTH', 'JTO', 'USDC', 'USDT', 'RENDER', 'BOME', 'ME',
      'DRIFT', 'TNSR', 'KMNO', 'IO', 'HNT', 'MOBILE', 'IOT', 'MOODENG', 'GOAT', 'ACT', 'PNUT',
      'CHILLGUY', 'FARTCOIN', 'PENGU', 'POPCAT', 'SAMO', 'WEN', 'PONKE'
    ]);
    const allowGeneric = !isSolana || CANONICAL_SOL_SYMBOLS.has(symUpper);

    return (contractLower && prices[contractLower]) ||
           (contract && prices[contract]) ||
           (h.coingeckoId && prices[h.coingeckoId]) ||
           (allowGeneric ? (prices[symUpper] || prices[symUpper.toLowerCase()]) : null);
  }

  function renderCurrentPage() {
    const prices       = CF.Storage.getPriceCache().data || {};
    const sources      = CF.Storage.getSources();
    const hiddenTokens = new Set(CF.Storage.getHiddenTokens());
    const settings     = CF.Storage.getSettings();
    const hideSpam     = settings.hideSpam !== false;

    const allHoldings = sources.flatMap(s => {
      const isSolanaSource = (s.chain || '').toLowerCase().includes('solana');
      return (s.holdings || [])
        .filter(h => {
          const sym = (h.symbol || '').toUpperCase().trim();
          if (hiddenTokens.has(sym)) return false;
          if (hideSpam && h.isSpam) return false;
          return true;
        })
        .map(h => {
          const isSol = isSolanaSource || (h.chain || '').toLowerCase().includes('solana');
          const pd = resolveHoldingPrice(h, prices, isSol);
          const unitPrice = pd?.usd || h.price || 0;
          const valueUSD  = unitPrice > 0 ? h.balance * unitPrice : 0;
          return {
            ...h,
            sourceId:   s.id,
            sourceName: s.name,
            price:      unitPrice,
            change24h:  pd?.usd_24h_change ?? h.change24h ?? null,
            image:      pd?.image       || h.image    || null,
            valueUSD:   valueUSD,
          };
        });
    });

    // Update per-source totals in storage
    sources.forEach(src => {
      const isSolanaSource = (src.chain || '').toLowerCase().includes('solana');
      let total = 0;
      (src.holdings || []).forEach(h => {
        const sym = (h.symbol || '').toUpperCase().trim();
        if (hiddenTokens.has(sym) || (hideSpam && h.isSpam)) {
          h.valueUSD = 0;
          return;
        }
        const isSol = isSolanaSource || (h.chain || '').toLowerCase().includes('solana');
        const pd = resolveHoldingPrice(h, prices, isSol);
        const unitPrice = pd?.usd || h.price || 0;
        h.price = unitPrice;
        h.valueUSD = unitPrice > 0 ? h.balance * unitPrice : 0;
        total += h.valueUSD;
      });
      CF.Storage.updateSource(src.id, { totalValueUSD: total, holdings: src.holdings });
    });

    switch (currentPage) {
      case 'dashboard':    CF.Dashboard.render(allHoldings, prices);   break;
      case 'sources':      CF.Dashboard.renderSources();                break;
      case 'transactions': CF.TxPage.render();                         break;
      case 'settings':     CF.Dashboard.renderSettings();              break;
    }
  }

  // ── Listeners ──────────────────────────────────────────────

  function setupListeners() {
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('collapsed');
    });

    document.getElementById('addSourceBtn')?.addEventListener('click', () => {
      CF.WalletModal.open();
    });

    document.getElementById('refreshBtn')?.addEventListener('click', async () => {
      if (isRefreshing) return;
      await refreshAll(true);
    });

    document.getElementById('modalClose')?.addEventListener('click', CF.WalletModal.close);
    document.getElementById('modalOverlay')?.addEventListener('click', e => {
      if (e.target.id === 'modalOverlay') CF.WalletModal.close();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') CF.WalletModal.close();
    });

    // Global setting save on input change
    document.addEventListener('change', e => {
      const input = e.target;
      if (input.dataset?.setting) {
        CF.Storage.saveSettings({ [input.dataset.setting]: input.value.trim() });
      }
    });
  }

  // ── Data Fetching ──────────────────────────────────────────

  async function refreshAll() {
    if (isRefreshing) return;
    isRefreshing = true;

    const btn = document.getElementById('refreshBtn');
    if (btn) btn.classList.add('spinning');

    try {
      const sources = CF.Storage.getSources();

      // Fetch all balances in parallel
      await Promise.allSettled(
        sources.map(src =>
          fetchSourceHoldings(src.id).catch(err =>
            console.warn(`[App] ${src.name}:`, err.message)
          )
        )
      );

      await refreshPrices();
      renderCurrentPage();

      // Daily snapshot
      const prices = CF.Storage.getPriceCache().data || {};
      const total  = CF.Storage.getSources().flatMap(s => s.holdings || [])
        .reduce((sum, h) => {
          const isSol = (h.chain || '').toLowerCase().includes('solana');
          const pd = resolveHoldingPrice(h, prices, isSol);
          const price = pd?.usd || h.price || 0;
          return sum + (price > 0 ? h.balance * price : (h.valueUSD || 0));
        }, 0);
      if (total > 0) CF.Storage.addSnapshot(total);

      const syncEl = document.getElementById('lastSynced');
      if (syncEl) syncEl.textContent = `Synced just now`;

      // Background sync transactions across all sources
      syncTransactions(true).catch(() => {});

    } finally {
      isRefreshing = false;
      if (btn) btn.classList.remove('spinning');
    }
  }

  async function fetchSourceHoldings(sourceId) {
    const source = CF.Storage.getSourceById(sourceId);
    if (!source) return;

    CF.Storage.updateSource(sourceId, { status: 'pending' });

    try {
      let holdings = [];

      if (source.type === 'manual') {
        // Manual entries don't need fetching — keep existing holdings
        CF.Storage.updateSource(sourceId, { status: 'ok', syncedAt: Date.now() });
        return;
      }

      const h = source.apiHandler;
      if      (h === 'evmScanner')  holdings = await CF.EVMScanner.fetchHoldings(source);
      else if (h === 'btcexplorer') holdings = await CF.BTCExplorer.fetchHoldings(source);
      else if (h === 'etherscan')   holdings = await CF.EtherscanAPI.fetchHoldings(source);
      else if (h === 'bscScan')     holdings = await CF.BSCScan.fetchHoldings(source);
      else if (h === 'injective')   holdings = await CF.InjectiveAPI.fetchHoldings(source);
      else if (h === 'solana')      holdings = await CF.SolanaAPI.fetchHoldings(source);
      else if (h === 'stacks')      holdings = await CF.StacksAPI.fetchHoldings(source);
      else if (h === 'ton')         holdings = await CF.TonAPI.fetchHoldings(source);
      else if (h === 'near')        holdings = await CF.NearAPI.fetchHoldings(source);
      else if (h === 'doge')        holdings = await CF.DogeAPI.fetchHoldings(source);
      else if (h === 'cosmosChains')holdings = await CF.CosmosChainsAPI.fetchHoldings(source);
      else if (h === 'aptos')       holdings = await CF.AptosAPI.fetchHoldings(source);
      else if (h === 'icp')         holdings = await CF.IcpAPI.fetchHoldings(source);
      else if (h === 'multichain')  holdings = await CF.MultichainAPI.fetchHoldings(source);
      else if (h === 'binance')     holdings = await CF.BinanceAPI.fetchHoldings(source);
      else throw new Error(`Unknown handler: ${h}`);

      CF.Storage.updateSource(sourceId, {
        holdings:  holdings || [],
        syncedAt:  Date.now(),
        status:    'ok',
        lastError: null,
      });

      renderCurrentPage();

    } catch (err) {
      CF.Storage.updateSource(sourceId, {
        status:    'error',
        lastError: err.message,
      });
      renderCurrentPage();
      throw err;
    }
  }

  async function refreshPrices() {
    const coinIds = new Set();
    const symbols = new Set();
    const contractTokens = [];

    CF.Storage.getSources().forEach(src =>
      (src.holdings || []).forEach(h => {
        if (h.coingeckoId) coinIds.add(h.coingeckoId);
        if (h.symbol && h.isCore !== false && !h.isSpam) symbols.add(h.symbol);
        if (h.contract && (/^0x[a-fA-F0-9]{40}$/.test(h.contract) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(h.contract))) {
          contractTokens.push({ contract: h.contract, symbol: h.symbol, chain: h.chain });
        }
      })
    );

    // Always include popular defaults so prices are ready
    Object.values(CF.NETWORKS).forEach(n => {
      if (n.coingeckoId) coinIds.add(n.coingeckoId);
      if (n.symbol)      symbols.add(n.symbol);
    });

    if (coinIds.size === 0 && symbols.size === 0) return;

    const prices = await CF.CoinGecko.getPrices([...coinIds], [...symbols], contractTokens);
    if (prices && Object.keys(prices).length > 0) {
      CF.Storage.setPriceCache(prices);
    }
  }

  function startPricePolling() {
    if (priceTimer) clearInterval(priceTimer);
    // Poll real-time prices every 15 seconds
    priceTimer = setInterval(async () => {
      await refreshPrices();
      renderCurrentPage();
      const syncEl = document.getElementById('lastSynced');
      if (syncEl) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        syncEl.innerHTML = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#4ade80;margin-right:5px;box-shadow:0 0 6px #4ade80;"></span>Live prices: ${timeStr}`;
      }
    }, 15000);
  }

  // ── Transaction sync ───────────────────────────────────────

  async function syncTransactions(silent = false) {
    const sources = CF.Storage.getSources();
    if (sources.length === 0) {
      if (!silent) CF.Notify.info('No connected sources to sync transactions for.');
      return;
    }

    if (!silent) CF.Notify.info(`Syncing transactions for ${sources.length} source(s)…`);
    let total = 0;

    await Promise.allSettled(
      sources.map(async src => {
        try {
          const txs = await CF.Transactions.fetchForSource(src);
          total += (txs || []).length;
        } catch (e) {
          console.warn('[App] Tx sync failed for', src.name, e);
        }
      })
    );

    if (currentPage === 'transactions') {
      CF.TxPage.render();
    }
    if (!silent) {
      CF.Notify.success(`Transaction history updated (${CF.Transactions.getAll().length} total)`);
    }
  }

  // ── Auto-Refresh ───────────────────────────────────────────

  function startRefreshTimer() {
    const settings = CF.Storage.getSettings();
    const ms       = (settings.refreshInterval || 60) * 1000;
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => refreshAll(), ms);
  }

  function restartRefreshTimer() {
    startPricePolling();
    startRefreshTimer();
  }

  return {
    init,
    refreshAll,
    fetchSourceHoldings,
    renderCurrentPage,
    restartRefreshTimer,
    syncTransactions,
  };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => CF.App.init());
