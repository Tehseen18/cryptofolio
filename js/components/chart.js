/* ============================================================
   chart.js — Chart.js wrappers for portfolio charts
   Includes CoinStats-style 7D / 24H / 30D / 90D performance engine
   ============================================================ */

window.CF = window.CF || {};

CF.Charts = (() => {
  let donutChart        = null;
  let historyChart      = null;
  let currentHoldings   = [];
  let currentTotalUSD   = 0;
  let activeTimeframe   = '7D';
  let defaultSummaryData = null;

  // In-memory cache for k-line price series: key -> [{ time, price }]
  const klineCache = new Map();

  Chart.defaults.color = '#6b7a99';
  Chart.defaults.borderColor = '#1e2030';
  Chart.defaults.font.family = "'Inter', sans-serif";

  // Common wrapper tokens to underlying ticker
  const ALIAS_MAP = {
    'WETH': 'ETH',
    'STETH': 'ETH',
    'CBETH': 'ETH',
    'RETH': 'ETH',
    'WBTC': 'BTC',
    'BTCB': 'BTC',
    'WSOL': 'SOL',
    'WBNB': 'BNB',
    'WMATIC': 'POL',
    'MATIC': 'POL',
    'WAVAX': 'AVAX',
    'VELO(V2)': 'VELODROME',
    'VELO(v2)': 'VELODROME',
    'VELO': 'VELODROME',
  };

  const STABLECOINS = new Set([
    'USDT', 'USDC', 'DAI', 'FDUSD', 'USDE', 'PYUSD', 'USDC.E', 'USDT.E', 'TUSD', 'BUSD', 'FRAX', 'LUSD'
  ]);

  const TIMEFRAME_CONFIG = {
    '24H': { interval: '1h', limit: 25, durationMs: 24 * 3600 * 1000, label: '24H' },
    '7D':  { interval: '4h', limit: 43, durationMs: 7 * 24 * 3600 * 1000, label: '7D' },
    '30D': { interval: '1d', limit: 31, durationMs: 30 * 24 * 3600 * 1000, label: '30D' },
    '90D': { interval: '1d', limit: 91, durationMs: 90 * 24 * 3600 * 1000, label: '90D' },
  };

  /**
   * Render allocation donut chart
   * @param {Array} holdings - [{ symbol, valueUSD }]
   */
  function renderDonut(holdings, canvasId = 'donutChart') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const sorted = [...holdings].sort((a, b) => b.valueUSD - a.valueUSD);
    const top    = sorted.slice(0, 8);
    const other  = sorted.slice(8).reduce((s, h) => s + (h.valueUSD || 0), 0);

    const labels = top.map(h => h.symbol);
    const data   = top.map(h => h.valueUSD || 0);
    const colors = CF.CHART_COLORS.slice(0, top.length);

    if (other > 0) {
      labels.push('Other');
      data.push(other);
      colors.push('#3a3f55');
    }

    if (donutChart) { donutChart.destroy(); donutChart = null; }

    donutChart = new Chart(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }] },
      options: {
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(ctx) {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct   = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                return ` ${CF.fmt.currency(ctx.parsed)}  (${pct}%)`;
              },
            },
          },
        },
        animation: { duration: 400 },
      },
    });

    // Render legend
    const legendEl = document.getElementById('donutLegend');
    if (legendEl) {
      const total = data.reduce((a, b) => a + b, 0);
      legendEl.innerHTML = labels.map((label, i) => `
        <div class="legend-item">
          <div class="legend-left">
            <div class="legend-dot" style="background:${colors[i]}"></div>
            <span class="legend-name">${label}</span>
          </div>
          <span class="legend-pct">${total > 0 ? ((data[i] / total) * 100).toFixed(1) : 0}%</span>
        </div>
      `).join('');
    }
  }

  /**
   * Fetch historical K-lines for a symbol from Binance (with stablecoin & cache handling)
   */
  async function fetchSymbolKlines(symbol, timeframe) {
    const rawSym = (symbol || '').toUpperCase().trim();
    const sym    = ALIAS_MAP[rawSym] || rawSym;
    const cfg    = TIMEFRAME_CONFIG[timeframe] || TIMEFRAME_CONFIG['7D'];
    const cacheKey = `${sym}_${timeframe}`;

    if (klineCache.has(cacheKey)) {
      return klineCache.get(cacheKey);
    }

    // Stablecoin check: constant 1.00
    if (STABLECOINS.has(sym) || STABLECOINS.has(rawSym)) {
      const now = Date.now();
      const stepMs = cfg.durationMs / (cfg.limit - 1);
      const points = [];
      for (let i = 0; i < cfg.limit; i++) {
        points.push({
          time: now - (cfg.limit - 1 - i) * stepMs,
          price: 1.00,
        });
      }
      klineCache.set(cacheKey, points);
      return points;
    }

    // Try Binance klines
    try {
      const pair = `${sym}USDT`;
      const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(pair)}&interval=${cfg.interval}&limit=${cfg.limit}`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const raw = await res.json();
        if (Array.isArray(raw) && raw.length > 0) {
          const points = raw.map(k => ({
            time: k[0],
            price: parseFloat(k[4]) || 0,
          }));
          klineCache.set(cacheKey, points);
          return points;
        }
      }
    } catch (e) {
      // Ignore network errors, will fallback gracefully
    }

    return null;
  }

  /**
   * Compute portfolio historical trajectory across the selected timeframe
   */
  async function computePortfolioTrajectory(holdings, timeframe = '7D') {
    const cfg = TIMEFRAME_CONFIG[timeframe] || TIMEFRAME_CONFIG['7D'];
    const totalCurrent = holdings.reduce((s, h) => s + (h.valueUSD || 0), 0);

    if (!holdings || holdings.length === 0 || totalCurrent <= 0) {
      return null;
    }

    // Sort by USD value descending, take assets that make up the vast majority of portfolio
    const sorted = [...holdings].filter(h => (h.valueUSD || 0) > 0.05).sort((a, b) => b.valueUSD - a.valueUSD);
    const topAssets = sorted.slice(0, 12);

    // Fetch klines in parallel for top assets
    const klineResults = await Promise.all(
      topAssets.map(async h => {
        const series = await fetchSymbolKlines(h.symbol, timeframe);
        return { holding: h, series };
      })
    );

    // Find a reference timeline from any successfully fetched series
    const validSeries = klineResults.find(r => r.series && r.series.length >= 2)?.series;

    let timestamps = [];
    if (validSeries) {
      timestamps = validSeries.map(p => p.time);
    } else {
      // Fallback: generate time points from now - durationMs
      const now = Date.now();
      const stepMs = cfg.durationMs / (cfg.limit - 1);
      for (let i = 0; i < cfg.limit; i++) {
        timestamps.push(now - (cfg.limit - 1 - i) * stepMs);
      }
    }

    const nPoints = timestamps.length;
    const portfolioPoints = [];

    // Other un-fetched/minor assets sum at current price
    const trackedAssets = new Set(topAssets.map(t => t.symbol));
    const untrackedUSD  = holdings
      .filter(h => !trackedAssets.has(h.symbol))
      .reduce((s, h) => s + (h.valueUSD || 0), 0);

    for (let i = 0; i < nPoints; i++) {
      let pointUSD = untrackedUSD;

      klineResults.forEach(({ holding, series }) => {
        const bal = holding.balance || 0;
        let price = holding.price || 0;

        if (series && series[i] && series[i].price > 0) {
          price = series[i].price;
        }
        pointUSD += (bal * price);
      });

      portfolioPoints.push({
        time: timestamps[i],
        value: Math.max(0, pointUSD),
      });
    }

    // Ensure the last point matches current total for seamless alignment
    if (portfolioPoints.length > 0 && totalCurrent > 0) {
      portfolioPoints[portfolioPoints.length - 1].value = totalCurrent;
    }

    return portfolioPoints;
  }

  /**
   * Main CoinStats-style portfolio performance chart renderer
   * @param {Array} holdings - aggregated holdings
   * @param {string} timeframe - '24H' | '7D' | '30D' | '90D'
   * @param {string} canvasId
   */
  async function renderPerformanceHistory(holdings, timeframe = '7D', canvasId = 'historyChart') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (holdings) currentHoldings = holdings;
    if (timeframe) activeTimeframe = timeframe;

    const total = currentHoldings.reduce((s, h) => s + (h.valueUSD || 0), 0);
    currentTotalUSD = total;

    // Update active button state
    document.querySelectorAll('.timeframe-btn').forEach(btn => {
      const tf = btn.getAttribute('data-tf');
      if (tf === activeTimeframe) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const perfValEl  = document.getElementById('chartPerfVal');
    const perfPillEl = document.getElementById('chartPerfPill');
    const loaderEl   = document.getElementById('chartLoadingIndicator');

    if (loaderEl) loaderEl.style.display = 'block';

    let points = null;
    try {
      points = await computePortfolioTrajectory(currentHoldings, activeTimeframe);
    } catch (e) {
      console.warn('[CF.Charts] Failed to compute trajectory:', e);
    }

    if (loaderEl) loaderEl.style.display = 'none';

    // Fallback: if no points or single point, try stored snapshots or flat line
    if (!points || points.length < 2) {
      const snapshots = CF.Storage.getSnapshots();
      if (snapshots && snapshots.length >= 2) {
        points = snapshots.map(s => ({
          time: new Date(s.date).getTime(),
          value: s.value,
        }));
      } else {
        // Flat baseline
        const now = Date.now();
        points = [
          { time: now - 7 * 24 * 3600 * 1000, value: total },
          { time: now, value: total },
        ];
      }
    }

    const startVal = points[0].value;
    const endVal   = points[points.length - 1].value;
    const diffUSD  = endVal - startVal;
    const diffPct  = startVal > 0 ? (diffUSD / startVal) * 100 : 0;
    const isUp     = diffUSD >= 0;

    // Store default summary for mouse leave restoration
    defaultSummaryData = {
      valStr: CF.fmt.currency(endVal),
      diffUSD,
      diffPct,
      isUp,
      tf: activeTimeframe,
    };

    updateSummaryUI(defaultSummaryData);

    // Render line chart with dynamic colors
    if (historyChart) {
      historyChart.destroy();
      historyChart = null;
    }

    const ctx = canvas.getContext('2d');
    const chartHeight = canvas.parentElement ? canvas.parentElement.clientHeight || 200 : 200;
    const gradient = ctx.createLinearGradient(0, 0, 0, chartHeight);

    if (isUp) {
      gradient.addColorStop(0, 'rgba(16, 185, 129, 0.28)');
      gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
    } else {
      gradient.addColorStop(0, 'rgba(244, 63, 94, 0.28)');
      gradient.addColorStop(1, 'rgba(244, 63, 94, 0.0)');
    }

    const lineColor = isUp ? '#10b981' : '#f43f5e';

    const labels = points.map(p => {
      const d = new Date(p.time);
      if (activeTimeframe === '24H') {
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      }
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const data = points.map(p => p.value);

    historyChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: lineColor,
          backgroundColor: gradient,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: lineColor,
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2,
          tension: 0.35,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        onHover: (event, elements) => {
          if (elements && elements.length > 0) {
            const index = elements[0].index;
            const hoveredVal = data[index];
            const hoveredDiffUSD = hoveredVal - startVal;
            const hoveredDiffPct = startVal > 0 ? (hoveredDiffUSD / startVal) * 100 : 0;
            const hoveredIsUp = hoveredDiffUSD >= 0;

            updateSummaryUI({
              valStr: CF.fmt.currency(hoveredVal),
              diffUSD: hoveredDiffUSD,
              diffPct: hoveredDiffPct,
              isUp: hoveredIsUp,
              tf: activeTimeframe,
              dateStr: labels[index],
            });
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              maxTicksLimit: 6,
              font: { size: 11, family: "'Inter', sans-serif" },
              color: '#6b7a99',
            },
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: {
              font: { size: 11, family: "'Inter', sans-serif" },
              color: '#6b7a99',
              callback: v => CF.fmt.currency(v, 'USD', true),
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#181a26',
            titleColor: '#e1e7f5',
            bodyColor: '#e1e7f5',
            borderColor: '#26293d',
            borderWidth: 1,
            padding: 10,
            boxPadding: 4,
            callbacks: {
              title: ctx => {
                const idx = ctx[0]?.dataIndex;
                if (idx != null && points[idx]) {
                  const d = new Date(points[idx].time);
                  return d.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                }
                return ctx[0]?.label || '';
              },
              label: ctx => {
                const val = ctx.parsed.y;
                const change = val - startVal;
                const pct = startVal > 0 ? (change / startVal) * 100 : 0;
                const sign = change >= 0 ? '+' : '';
                return [
                  ` Value: ${CF.fmt.currency(val)}`,
                  ` Change: ${sign}${CF.fmt.currency(change)} (${sign}${pct.toFixed(2)}%)`,
                ];
              },
            },
          },
        },
        animation: { duration: 350 },
      },
    });

    // Reset summary when mouse leaves canvas
    canvas.onmouseleave = () => {
      if (defaultSummaryData) {
        updateSummaryUI(defaultSummaryData);
      }
    };
  }

  function updateSummaryUI({ valStr, diffUSD, diffPct, isUp, tf, dateStr }) {
    const perfValEl  = document.getElementById('chartPerfVal');
    const perfPillEl = document.getElementById('chartPerfPill');

    if (perfValEl) {
      perfValEl.textContent = valStr;
    }

    if (perfPillEl) {
      const sign = diffUSD >= 0 ? '+' : '';
      const prefix = diffUSD >= 0 ? '▲ ' : '▼ ';
      perfPillEl.className = `chart-perf-pill ${isUp ? 'change-up' : 'change-down'}`;
      perfPillEl.textContent = `${prefix}${sign}${CF.fmt.currency(diffUSD)} (${sign}${diffPct.toFixed(2)}%) ${dateStr ? `• ${dateStr}` : tf}`;
    }
  }

  function changeTimeframe(tf) {
    if (tf === activeTimeframe) return;
    activeTimeframe = tf;
    renderPerformanceHistory(currentHoldings, tf);
  }

  function destroyAll() {
    if (donutChart)   { donutChart.destroy();   donutChart   = null; }
    if (historyChart) { historyChart.destroy(); historyChart = null; }
  }

  // Backward compatibility alias for renderHistory
  function renderHistory(snapshots, canvasId) {
    renderPerformanceHistory(currentHoldings, activeTimeframe, canvasId);
  }

  return {
    renderDonut,
    renderPerformanceHistory,
    renderHistory,
    changeTimeframe,
    destroyAll,
  };
})();
