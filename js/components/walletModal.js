/* ============================================================
   walletModal.js — Add Source modal (wallets + exchanges)
   Fix: save source immediately, fetch in background (never delete on error)
   ============================================================ */

window.CF = window.CF || {};

CF.WalletModal = (() => {
  let selectedNetwork  = null;
  let selectedExchange = null;

  function open() {
    selectedNetwork  = null;
    selectedExchange = null;
    // Clean up any leftover footer from previous open
    const oldFooter = document.querySelector('#modal .modal-footer');
    if (oldFooter) oldFooter.remove();

    renderStep1();
    document.getElementById('modalTitle').textContent = 'Add Source';
    document.getElementById('modalOverlay').classList.remove('hidden');
  }

  function close() {
    document.getElementById('modalOverlay').classList.add('hidden');
  }

  // ── Step 1: Choose source type ─────────────────────────────

  function renderStep1() {
    const body = document.getElementById('modalBody');
    body.innerHTML = `
      <p style="font-size:12px;color:var(--text-3);margin-bottom:14px;">
        Connect a wallet address or exchange to track your holdings.
      </p>
      <div class="form-label" style="margin-bottom:8px;">Blockchain Wallets</div>
      <div class="network-grid" style="margin-bottom:16px;">
        ${Object.values(CF.NETWORKS).map(n => `
          <button class="network-btn" data-network="${n.id}" type="button">
            <span class="network-btn-icon" style="color:${n.color}">${n.icon}</span>
            <span>${n.symbol}</span>
          </button>
        `).join('')}
      </div>
      <div class="form-label" style="margin-bottom:8px;">Exchanges &amp; Manual</div>
      <div class="network-grid">
        ${Object.values(CF.EXCHANGE_TYPES).map(e => `
          <button class="network-btn" data-exchange="${e.id}" type="button">
            <span class="network-btn-icon" style="color:${e.color}">${e.icon}</span>
            <span>${e.name.split(' ')[0]}</span>
          </button>
        `).join('')}
      </div>
    `;

    body.querySelectorAll('[data-network]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedNetwork  = CF.NETWORKS[btn.dataset.network];
        selectedExchange = null;
        renderStep2Wallet();
      });
    });

    body.querySelectorAll('[data-exchange]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedExchange = CF.EXCHANGE_TYPES[btn.dataset.exchange];
        selectedNetwork  = null;
        renderStep2Exchange();
      });
    });
  }

  // ── Step 2a: Wallet address form ───────────────────────────

  function renderStep2Wallet() {
    const n    = selectedNetwork;
    const body = document.getElementById('modalBody');
    document.getElementById('modalTitle').textContent = `Add ${n.name} Wallet`;

    body.innerHTML = `
      <div class="info-box" style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <span style="font-size:24px;color:${n.color};flex-shrink:0;">${n.icon}</span>
        <div>
          <div style="font-weight:600;font-size:13px;">${n.name} (${n.symbol})</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:2px;">
            Public address only — read-only, no private keys needed
          </div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="srcName">Wallet Label (Optional)</label>
        <input type="text" id="srcName" placeholder="e.g. Cold Storage, Trading, Hot Wallet" />
      </div>
      <div class="form-group">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <label class="form-label" for="srcAddress" style="margin-bottom:0;">Wallet Address(es) *</label>
          <span style="font-size:11px;color:var(--text-3);">Paste 1 or multiple (separated by new line or comma)</span>
        </div>
        <textarea id="srcAddress" rows="3" placeholder="${n.placeholder}\n(Tip: Paste multiple addresses of the same or different networks)"
          autocomplete="off" spellcheck="false" style="font-family:'JetBrains Mono',monospace;font-size:12px;width:100%;resize:vertical;border-radius:6px;padding:8px 10px;background:var(--card-bg);border:1px solid var(--border);color:var(--text-1);"></textarea>
      </div>
      ${n.requiresKey ? `
        <div class="info-box warn" style="font-size:11px;">
          ⚠ A free API key for this network is needed to fetch token balances.
          Go to <strong>Settings → API Keys</strong> to add it (takes 1 min, free forever).
        </div>
      ` : ''}
    `;

    const footer = ensureFooter();
    footer.innerHTML = `
      <button class="btn-secondary" id="modalBackBtn" type="button">← Back</button>
      <button class="btn-primary" id="modalSaveBtn" type="button">Add Wallet(s)</button>
    `;

    document.getElementById('modalBackBtn').onclick = () => {
      document.getElementById('modalTitle').textContent = 'Add Source';
      footer.innerHTML = '';
      renderStep1();
    };
    document.getElementById('modalSaveBtn').onclick = () => saveWallet(n);
  }

  // ── Step 2b: Exchange form ─────────────────────────────────

  function renderStep2Exchange() {
    const ex   = selectedExchange;
    const body = document.getElementById('modalBody');
    document.getElementById('modalTitle').textContent = `Connect ${ex.name}`;

    body.innerHTML = `
      <div class="info-box" style="margin-bottom:14px;">
        <div style="font-weight:600;font-size:13px;margin-bottom:4px;">${ex.icon} ${ex.name}</div>
        <div style="font-size:11px;color:var(--text-3);">${ex.note}</div>
      </div>
      <div class="form-group">
        <label class="form-label" for="srcName">Label</label>
        <input type="text" id="srcName" placeholder="e.g. Binance Main" />
      </div>
      ${ex.fields.map(f => `
        <div class="form-group">
          <label class="form-label" for="exField_${f.key}">${f.label}</label>
          <input type="${f.type}" id="exField_${f.key}" placeholder="${f.placeholder}" autocomplete="off" />
        </div>
      `).join('')}
      ${ex.id === 'binance' ? `
        <div class="info-box warn" style="font-size:11px;">
          ⚠ Binance needs the local proxy running: <strong>node proxy/proxy.js</strong><br>
          Your secret never leaves your machine.
        </div>
      ` : ''}
    `;

    const footer = ensureFooter();
    footer.innerHTML = `
      <button class="btn-secondary" id="modalBackBtn" type="button">← Back</button>
      <button class="btn-primary" id="modalSaveBtn" type="button">
        ${ex.id === 'manual' ? 'Save' : 'Connect'}
      </button>
    `;

    document.getElementById('modalBackBtn').onclick = () => {
      document.getElementById('modalTitle').textContent = 'Add Source';
      footer.innerHTML = '';
      renderStep1();
    };
    document.getElementById('modalSaveBtn').onclick = () => saveExchange(ex);
  }

  // ── Save wallet (supports multiple addresses & auto-detection) ─

  async function saveWallet(defaultNetwork) {
    const rawInput = document.getElementById('srcAddress')?.value.trim() || '';
    if (!rawInput) {
      CF.Notify.error('Please enter at least one wallet address');
      return;
    }

    const baseLabel = document.getElementById('srcName')?.value.trim();

    // Split input by newlines, commas, or semicolons
    const rawAddrs = rawInput.split(/[\n,;]+/).map(a => a.trim()).filter(Boolean);
    if (rawAddrs.length === 0) {
      CF.Notify.error('Please enter a valid wallet address');
      return;
    }

    const allSources = CF.Storage.getSources();
    const addedSources = [];
    const resyncedSources = [];

    rawAddrs.forEach((cleanAddr, idx) => {
      // Auto-detect network from address format
      const targetNetwork = detectNetwork(cleanAddr, defaultNetwork);

      // Check existing duplicate
      const existing = allSources.find(s =>
        (s.address || '').trim().toLowerCase() === cleanAddr.toLowerCase()
      );

      if (existing) {
        resyncedSources.push(existing);
        return;
      }

      // Generate distinct label for multiple wallets of the same network
      let name;
      const shortAddr = cleanAddr.length > 10
        ? `${cleanAddr.slice(0, 4)}...${cleanAddr.slice(-4)}`
        : cleanAddr;

      if (baseLabel) {
        name = rawAddrs.length > 1 ? `${baseLabel} #${idx + 1} (${shortAddr})` : baseLabel;
      } else {
        name = `${targetNetwork.name} (${shortAddr})`;
      }

      if (targetNetwork.id === 'aptos' && CF.AptosAPI && CF.AptosAPI.normalizeAddress) {
        cleanAddr = CF.AptosAPI.normalizeAddress(cleanAddr);
      }
      if (targetNetwork.id === 'icp' && CF.IcpAPI && CF.IcpAPI.normalizeAddress) {
        cleanAddr = CF.IcpAPI.normalizeAddress(cleanAddr);
      }

      const newSource = CF.Storage.addSource({
        type:       'wallet',
        network:    targetNetwork.id,
        subtype:    targetNetwork.id,
        name,
        address:    cleanAddr,
        apiHandler: targetNetwork.apiHandler,
      });

      addedSources.push(newSource);
    });

    close();

    if (addedSources.length > 0) {
      CF.Notify.info(`Added ${addedSources.length} source(s) — fetching balances…`);
      CF.App.renderCurrentPage();

      // Trigger background sync for all newly added sources concurrently
      addedSources.forEach(src => {
        CF.App.fetchSourceHoldings(src.id)
          .then(() => {
            CF.App.renderCurrentPage();
            const count = (CF.Storage.getSourceById(src.id)?.holdings || []).length;
            CF.Notify.success(`${src.name} synced (${count} assets)`);
          })
          .catch(err => {
            CF.Notify.error(`${src.name}: ${err.message}`, 8000);
            CF.App.renderCurrentPage();
          });

        // Background transaction sync
        CF.Transactions?.fetchForSource(src).catch(() => {});
      });
    }

    if (resyncedSources.length > 0) {
      resyncedSources.forEach(existing => {
        CF.Notify.info(`Re-syncing existing ${existing.name}...`);
        CF.App.fetchSourceHoldings(existing.id)
          .then(() => {
            CF.App.renderCurrentPage();
            const count = (CF.Storage.getSourceById(existing.id)?.holdings || []).length;
            CF.Notify.success(`${existing.name} re-synced (${count} assets)`);
          })
          .catch(err => {
            CF.Notify.error(`${existing.name}: ${err.message}`);
          });
      });
    }
  }

  // ── Save exchange ──────────────────────────────────────────

  async function saveExchange(exchange) {
    const name = document.getElementById('srcName')?.value.trim() || exchange.name;
    const fieldValues = {};

    exchange.fields.forEach(f => {
      fieldValues[f.key] = document.getElementById(`exField_${f.key}`)?.value.trim() || '';
    });

    // Validate
    for (const f of exchange.fields) {
      if (!fieldValues[f.key] && f.type !== 'number') {
        CF.Notify.error(`Please enter ${f.label}`);
        return;
      }
    }

    if (exchange.id === 'manual') {
      const coin   = (fieldValues.coin || '').toUpperCase();
      const amount = parseFloat(fieldValues.amount) || 0;
      const cost   = parseFloat(fieldValues.avgCost) || null;

      if (!coin || amount <= 0) {
        CF.Notify.error('Enter a valid coin symbol and amount > 0');
        return;
      }

      const saveBtn = document.getElementById('modalSaveBtn');
      saveBtn.disabled    = true;
      saveBtn.textContent = 'Looking up…';

      const results = await CF.CoinGecko.searchCoin(coin).catch(() => []);
      const match   = results.find(r => r.symbol === coin) || results[0];

      CF.Storage.addSource({
        type:       'manual',
        network:    'manual',
        name:       name || coin,
        apiHandler: 'manual',
        syncedAt:   Date.now(),
        status:     'ok',
        holdings: [{
          coingeckoId: match?.id || null,
          symbol:      coin,
          name:        match?.name || coin,
          balance:     amount,
          avgCost:     cost,
          valueUSD:    null,
        }],
      });

      CF.Notify.success(`${coin} added`);
      close();
      CF.App.renderCurrentPage();
      return;
    }

    // Exchange (Binance etc.) — save first, fetch in background
    const source = CF.Storage.addSource({
      type:       'exchange',
      network:    exchange.id,
      name,
      apiHandler: exchange.apiHandler,
      ...fieldValues,
    });

    close();
    CF.Notify.info(`${name} connected — fetching balances…`);
    CF.App.renderCurrentPage();

    CF.App.fetchSourceHoldings(source.id)
      .then(() => {
        CF.App.renderCurrentPage();
        CF.Notify.success(`${name} synced ✓`);
      })
      .catch(err => {
        CF.Notify.error(`${name}: ${err.message}`, 8000);
        CF.App.renderCurrentPage();
      });
  }

  // ── Utility ────────────────────────────────────────────────

  function detectNetwork(cleanAddr, fallback) {
    if (!cleanAddr) return fallback;
    const trimmed = cleanAddr.trim();

    if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      return CF.NETWORKS.evm || fallback;
    }
    if (/^D[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed)) {
      return CF.NETWORKS.doge || fallback;
    }
    if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(trimmed)) {
      return CF.NETWORKS.bitcoin || fallback;
    }
    if (/^S[PM][0-9A-Z]{38,41}$/i.test(trimmed)) {
      return CF.NETWORKS.stacks || fallback;
    }
    if (/^[EU]Q[0-9a-zA-Z_-]{46}$/.test(trimmed)) {
      return CF.NETWORKS.ton || fallback;
    }
    if (/^cosmos1[a-z0-9]{38,58}$/.test(trimmed)) {
      return CF.NETWORKS.cosmos || fallback;
    }
    if (/^osmo1[a-z0-9]{38,58}$/.test(trimmed)) {
      return CF.NETWORKS.osmosis || fallback;
    }
    if (/^sei1[a-z0-9]{38,58}$/.test(trimmed)) {
      return CF.NETWORKS.sei || fallback;
    }
    if (/^inj1[a-z0-9]{38,58}$/.test(trimmed)) {
      return CF.NETWORKS.injective || fallback;
    }
    if (/^(([a-z\d]+[-_])*[a-z\d]+\.)*near$/i.test(trimmed) || (trimmed.endsWith('.near') && trimmed.length <= 64)) {
      return CF.NETWORKS.near || fallback;
    }
    if (/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
      return CF.NETWORKS.aptos || fallback;
    }
    // ICP Principal ID (e.g. 5-character groups separated by dashes)
    if (/^[a-z0-9]{3,63}(-[a-z0-9]{3,63})+$/i.test(trimmed)) {
      return CF.NETWORKS.icp || fallback;
    }
    // ICP 64-hex Account ID (without 0x prefix)
    if (/^[a-fA-F0-9]{64}$/.test(trimmed)) {
      return CF.NETWORKS.icp || fallback;
    }
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
      return CF.NETWORKS.solana || fallback;
    }
    return fallback;
  }

  function ensureFooter() {
    let footer = document.querySelector('#modal .modal-footer');
    if (!footer) {
      footer = document.createElement('div');
      footer.className = 'modal-footer';
      document.getElementById('modal').appendChild(footer);
    }
    return footer;
  }

  return { open, close, detectNetwork };
})();
