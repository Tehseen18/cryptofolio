# CryptoFolio 🔐
> Free, private, self-hosted crypto portfolio tracker.  
> No account. No subscription. No data leaves your machine.

---

## Quick Start

```bash
# Option 1 — Simplest (no terminal needed)
# Just open index.html in your browser (Chrome/Firefox/Edge)
open index.html

# Option 2 — Recommended (fixes minor CORS edge cases)
npx serve .
# Open http://localhost:3000
```

---

## Features

- 📊 **Live portfolio dashboard** — total value, 24h P&L, allocation donut chart
- 👛 **Multi-wallet support** — add as many addresses as you want per network
- 📈 **Historical chart** — portfolio value over time (daily snapshots)
- 🔄 **Auto-refresh** — configurable interval (30s to 10min)
- 📥 **Export** — CSV and JSON (secrets redacted)
- 🔒 **100% private** — everything lives in `localStorage`

---

## Supported Networks

| Network   | Coin | API Key? | Notes |
|-----------|------|----------|-------|
| Bitcoin   | BTC  | ❌ None  | Via blockchain.info |
| Ethereum  | ETH + ERC-20 | ✅ Free | Sign up at etherscan.io |
| BNB Chain | BNB + BEP-20 | ✅ Free | Sign up at bscscan.com |
| Injective | INJ  | ❌ None  | Via Injective LCD |
| Solana    | SOL + SPL | ❌ None | Via public RPC |
| Polygon   | POL  | ✅ Free  | Sign up at polygonscan.com |
| Cosmos    | ATOM | ❌ None  | Via Cosmos LCD |
| Osmosis   | OSMO | ❌ None  | Via Osmosis LCD |
| Avalanche | AVAX | ✅ Free  | Sign up at snowtrace.io |
| **Binance** | All spot | ✅ Your keys | Requires proxy (see below) |
| **Manual** | Any coin | ❌ None | Enter balance manually |

---

## Binance Integration (Optional)

Binance blocks direct browser requests (CORS policy). To connect your Binance account:

```bash
# One-time setup (uses only Node.js built-ins — no npm install needed)
node proxy/proxy.js
```

Leave that terminal open, then add Binance in the app under **+ Add Source → Binance**.

> **Privacy**: Your Binance API key travels: Browser → localhost:3131 → Binance.  
> It never touches any external server.
>
> **Security**: Use a **read-only** API key in Binance (Account → API Management → Enable "Read info" only).

---

## Free API Keys

These unlock token balances for EVM wallets. All free, no credit card.

| Site | Steps |
|------|-------|
| [etherscan.io](https://etherscan.io) | Account → API Keys → Create |
| [bscscan.com](https://bscscan.com) | Account → API Keys → Create |
| [polygonscan.com](https://polygonscan.com) | Account → API Keys → Create |
| [snowtrace.io](https://snowtrace.io) | Account → API Keys → Create |

Paste them in **Settings → API Keys**.

---

## Privacy & Security

- **No backend** — the app is 100% static HTML/CSS/JS
- **No analytics** — no tracking scripts, no telemetry
- **localStorage only** — data never leaves your browser
- **Read-only keys** — wallet addresses are public; exchange keys fetch balances only
- **Secrets redacted on export** — API secrets are not included in JSON/CSV exports
- **No npm packages** — no supply-chain risk

---

## Project Structure

```
cryptofolio/
├── index.html           # App shell
├── css/
│   └── style.css        # Dark theme design system
├── js/
│   ├── app.js           # Main orchestrator
│   ├── storage.js       # localStorage wrapper
│   ├── utils/
│   │   ├── constants.js # Network definitions, API endpoints
│   │   └── formatter.js # Number/currency formatters
│   ├── apis/
│   │   ├── coingecko.js # Price data (free, no key)
│   │   ├── btcexplorer.js
│   │   ├── etherscan.js
│   │   ├── binance.js
│   │   ├── injective.js
│   │   ├── solana.js
│   │   ├── bscScan.js
│   │   └── multichain.js
│   └── components/
│       ├── dashboard.js
│       ├── walletModal.js
│       ├── chart.js
│       └── notifications.js
└── proxy/
    └── proxy.js         # Optional Binance CORS proxy
```

---

## License

MIT — do whatever you want with it.
