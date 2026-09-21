/* ============================================================
   chart.js — Chart.js wrappers for portfolio charts
   ============================================================ */

window.CF = window.CF || {};

CF.Charts = (() => {
  let donutChart   = null;
  let historyChart = null;

  Chart.defaults.color = '#6b7a99';
  Chart.defaults.borderColor = '#1e2030';
  Chart.defaults.font.family = "'Inter', sans-serif";

  /**
   * Render allocation donut chart
   * @param {Array} holdings - [{ symbol, valueUSD }]
   */
  function renderDonut(holdings, canvasId = 'donutChart') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Top 8 + Other
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
        animation: { duration: 500 },
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
   * Render portfolio history line chart
   * @param {Array} snapshots - [{ date, value }]
   */
  function renderHistory(snapshots, canvasId = 'historyChart') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (!snapshots || snapshots.length === 0) return;

    const labels = snapshots.map(s => {
      const d = new Date(s.date);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const data = snapshots.map(s => s.value);

    if (historyChart) { historyChart.destroy(); historyChart = null; }

    const gradient = canvas.getContext('2d').createLinearGradient(0, 0, 0, 160);
    gradient.addColorStop(0, 'rgba(124, 92, 252, 0.25)');
    gradient.addColorStop(1, 'rgba(124, 92, 252, 0.0)');

    historyChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: '#7c5cfc',
          backgroundColor: gradient,
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.3,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 6, font: { size: 11 } } },
          y: {
            grid: { color: 'rgba(30,32,48,0.8)' },
            ticks: {
              font: { size: 11 },
              callback: v => CF.fmt.currency(v, 'USD', true),
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${CF.fmt.currency(ctx.parsed.y)}`,
            },
          },
        },
        animation: { duration: 500 },
      },
    });
  }

  function destroyAll() {
    if (donutChart)   { donutChart.destroy();   donutChart   = null; }
    if (historyChart) { historyChart.destroy(); historyChart = null; }
  }

  return { renderDonut, renderHistory, destroyAll };
})();
