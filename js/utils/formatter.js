/* ============================================================
   formatter.js — Number, currency, address formatters
   ============================================================ */

window.CF = window.CF || {};

CF.fmt = {
  /**
   * Format a USD value, e.g. 1234567.89 → "$1,234,567.89"
   */
  currency(value, currencyCode = 'USD', compact = false) {
    if (value == null || isNaN(value)) return '—';
    const settings = CF.Storage ? CF.Storage.getSettings() : {};
    const code = currencyCode || settings.currency || 'USD';
    const sym  = (CF.CURRENCIES[code] || CF.CURRENCIES.USD).symbol;
    const abs  = Math.abs(value);

    if (compact) {
      if (abs >= 1e9) return `${sym}${(value / 1e9).toFixed(2)}B`;
      if (abs >= 1e6) return `${sym}${(value / 1e6).toFixed(2)}M`;
      if (abs >= 1e3) return `${sym}${(value / 1e3).toFixed(1)}K`;
    }

    if (value === 0) return `${sym}0.00`;
    if (abs >= 1000) {
      return `${sym}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (abs >= 1)       return `${sym}${value.toFixed(2)}`;
    if (abs >= 0.01)    return `${sym}${value.toFixed(4)}`;
    if (abs >= 0.00001) return `${sym}${value.toFixed(6)}`;
    return `${sym}${value.toFixed(8)}`;
  },

  /**
   * Format a percentage, e.g. 2.34 → "+2.34%" (with sign)
   */
  pct(value, withSign = true) {
    if (value == null || isNaN(value)) return '—';
    const sign = withSign && value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  },

  /**
   * Format a coin balance, trimming trailing zeros
   * e.g. 0.00012345 → "0.00012345"   1.5 → "1.5"
   */
  balance(value, maxDecimals = 8) {
    if (value == null || isNaN(value)) return '0';
    if (value === 0) return '0';
    if (Math.abs(value) >= 1000) {
      return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
    }
    return parseFloat(value.toFixed(maxDecimals)).toString();
  },

  /**
   * Truncate a wallet address: "0xAbCd...1234"
   */
  address(addr, start = 6, end = 4) {
    if (!addr) return '';
    if (addr.length <= start + end + 3) return addr;
    return `${addr.slice(0, start)}...${addr.slice(-end)}`;
  },

  /**
   * Human-readable time since a timestamp
   */
  timeAgo(timestamp) {
    if (!timestamp) return 'Never';
    const diff = (Date.now() - timestamp) / 1000;
    if (diff < 60)   return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  },

  /**
   * CSS class for a price change value
   */
  changeClass(value) {
    if (!value || value === 0) return 'change-neutral';
    return value > 0 ? 'change-up' : 'change-down';
  },

  /**
   * Arrow + value for display
   */
  changeDisplay(value) {
    if (value == null || isNaN(value)) return '<span class="change-neutral">—</span>';
    const cls  = CF.fmt.changeClass(value);
    const sign = value > 0 ? '▲' : value < 0 ? '▼' : '';
    return `<span class="${cls}">${sign} ${Math.abs(value).toFixed(2)}%</span>`;
  },
};
