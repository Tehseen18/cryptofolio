/* ============================================================
   constants.js — Supported networks, coin map, endpoints
   ============================================================ */

window.CF = window.CF || {};

CF.NETWORKS = {
  // One EVM entry covers ALL EVM-compatible chains automatically
  evm: {
    id:             'evm',
    name:           'EVM Wallet',
    symbol:         'All Chains',
    coingeckoId:    'ethereum',
    icon:           'Ξ',
    color:          '#627eea',
    apiHandler:     'evmScanner',
    placeholder:    '0x...',
    supportsTokens: true,
    requiresKey:    false,
    description:    'ETH · BASE · ARB · OP · SCROLL · ZORA · ROBINHOOD · BNB + 70+ chains',
  },
  bitcoin: {
    id:             'bitcoin',
    name:           'Bitcoin',
    symbol:         'BTC',
    coingeckoId:    'bitcoin',
    icon:           '₿',
    color:          '#f7931a',
    apiHandler:     'btcexplorer',
    placeholder:    'bc1q... or 1... or 3...',
    supportsTokens: false,
  },
  injective: {
    id:             'injective',
    name:           'Injective',
    symbol:         'INJ',
    coingeckoId:    'injective-protocol',
    icon:           '◎',
    color:          '#00a3ff',
    apiHandler:     'injective',
    subtype:        'injective',
    placeholder:    'inj1...',
    supportsTokens: false,
  },
  solana: {
    id:             'solana',
    name:           'Solana',
    symbol:         'SOL',
    coingeckoId:    'solana',
    icon:           '◑',
    color:          '#9945ff',
    apiHandler:     'solana',
    placeholder:    'Public key (base58)',
    supportsTokens: true,
  },
  doge: {
    id:             'doge',
    name:           'Dogecoin',
    symbol:         'DOGE',
    coingeckoId:    'dogecoin',
    icon:           'Ð',
    color:          '#c2a633',
    apiHandler:     'doge',
    placeholder:    'D...',
    supportsTokens: false,
  },
  cosmos: {
    id:             'cosmos',
    name:           'Cosmos Hub',
    symbol:         'ATOM',
    coingeckoId:    'cosmos',
    icon:           '✦',
    color:          '#6f7390',
    apiHandler:     'cosmosChains',
    subtype:        'cosmos',
    placeholder:    'cosmos1...',
    supportsTokens: false,
  },
  osmosis: {
    id:             'osmosis',
    name:           'Osmosis',
    symbol:         'OSMO',
    coingeckoId:    'osmosis',
    icon:           '⊕',
    color:          '#750bbf',
    apiHandler:     'cosmosChains',
    subtype:        'osmosis',
    placeholder:    'osmo1...',
    supportsTokens: false,
  },
  sei: {
    id:             'sei',
    name:           'Sei Network',
    symbol:         'SEI',
    coingeckoId:    'sei-network',
    icon:           '🔴',
    color:          '#9b1c2e',
    apiHandler:     'cosmosChains',
    subtype:        'sei',
    placeholder:    'sei1...',
    supportsTokens: false,
  },
  stacks: {
    id:             'stacks',
    name:           'Stacks',
    symbol:         'STX',
    coingeckoId:    'blockstack',
    icon:           'Ӿ',
    color:          '#5546ff',
    apiHandler:     'stacks',
    placeholder:    'SP... or SM...',
    supportsTokens: true,
  },
  ton: {
    id:             'ton',
    name:           'TON / Gram',
    symbol:         'TON',
    coingeckoId:    'the-open-network',
    icon:           '💎',
    color:          '#0098ea',
    apiHandler:     'ton',
    placeholder:    'EQ... or UQ...',
    supportsTokens: true,
  },
  near: {
    id:             'near',
    name:           'NEAR Protocol',
    symbol:         'NEAR',
    coingeckoId:    'near',
    icon:           'Ⓝ',
    color:          '#000000',
    apiHandler:     'near',
    placeholder:    'name.near or 64-hex',
    supportsTokens: false,
  },
  aptos: {
    id:             'aptos',
    name:           'Aptos',
    symbol:         'APT',
    coingeckoId:    'aptos',
    icon:           '▲',
    color:          '#2ed8a7',
    apiHandler:     'aptos',
    placeholder:    '0x... (64 hex characters)',
    supportsTokens: true,
  },
  icp: {
    id:             'icp',
    name:           'Internet Computer',
    symbol:         'ICP',
    coingeckoId:    'internet-computer',
    icon:           '∞',
    color:          '#29abe2',
    apiHandler:     'icp',
    placeholder:    'Principal (aaaaa-aa...) or 64-hex Account ID',
    supportsTokens: false,
  },
};

CF.EXCHANGE_TYPES = {
  binance: {
    id:         'binance',
    name:       'Binance',
    icon:       '◈',
    color:      '#f3ba2f',
    apiHandler: 'binance',
    fields: [
      { key: 'apiKey',    label: 'API Key',    type: 'text',     placeholder: 'Your Binance API key' },
      { key: 'apiSecret', label: 'API Secret', type: 'password', placeholder: 'Your Binance API secret' },
    ],
    note: 'Use read-only API keys. Secret stays on your device only.',
  },
  manual: {
    id:         'manual',
    name:       'Manual Entry',
    icon:       '✎',
    color:      '#6b7a99',
    apiHandler: 'manual',
    fields: [
      { key: 'coin',    label: 'Coin Symbol',          type: 'text',   placeholder: 'BTC, ETH, SOL...' },
      { key: 'amount',  label: 'Amount',               type: 'number', placeholder: '0.00' },
      { key: 'avgCost', label: 'Avg Buy Price (USD)',   type: 'number', placeholder: 'Optional — used for P&L' },
    ],
    note: 'Track any coin by entering amounts manually.',
  },
};

// Chart colours
CF.CHART_COLORS = [
  '#7c5cfc','#22c55e','#f59e0b','#ef4444','#06b6d4',
  '#e879f9','#34d399','#f97316','#a78bfa','#60a5fa',
  '#fb7185','#4ade80','#fbbf24','#38bdf8','#c084fc',
];

// API base URLs
CF.COINGECKO_API   = 'https://api.coingecko.com/api/v3';
CF.ETHERSCAN_API   = 'https://api.etherscan.io/api';
CF.BSCSCAN_API     = 'https://api.bscscan.com/api';
CF.POLYGONSCAN_API = 'https://api.polygonscan.com/api';
CF.SNOWTRACE_API   = 'https://api.snowtrace.io/api';
CF.INJECTIVE_LCD   = 'https://lcd.injective.network';
CF.COSMOS_LCD      = 'https://lcd-cosmoshub.keplr.app';
CF.OSMOSIS_LCD     = 'https://lcd.osmosis.zone';
CF.SOLANA_RPC      = 'https://api.mainnet-beta.solana.com';
CF.BINANCE_API     = 'https://api.binance.com';
CF.BINANCE_PROXY   = 'http://localhost:3131';

CF.REFRESH_INTERVALS = {
  30:  '30 seconds',
  60:  '1 minute',
  120: '2 minutes',
  300: '5 minutes',
  600: '10 minutes',
};

CF.CURRENCIES = {
  USD: { symbol: '$', name: 'US Dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British Pound' },
  INR: { symbol: '₹', name: 'Indian Rupee' },
  AED: { symbol: 'د.إ', name: 'UAE Dirham' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar' },
};
