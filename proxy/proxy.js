/**
 * CryptoFolio — Binance CORS Proxy
 * ─────────────────────────────────
 * Run: node proxy.js
 * Listens on: http://localhost:3131
 *
 * Forwards requests to Binance API, adding CORS headers.
 * Your API keys are sent directly from YOUR browser to Binance
 * via this local process — they never go to any external server.
 */

const http  = require('http');
const https = require('https');
const url   = require('url');

const PORT       = 3131;
const BINANCE    = 'api.binance.com';
const ALLOWED_PATHS = [
  '/api/v3/ping',
  '/api/v3/time',
  '/api/v3/account',
  '/api/v3/myTrades',
  '/api/v3/openOrders',
  '/sapi/v1/capital/config/getall',
  '/sapi/v1/accountSnapshot',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  'null',  // file:// origin
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'X-MBX-APIKEY, Content-Type',
  'Access-Control-Max-Age':       '86400',
};

const server = http.createServer((req, res) => {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);
  const path   = parsed.pathname;

  // Only allow specific Binance endpoints
  const allowed = ALLOWED_PATHS.some(p => path.startsWith(p));
  if (!allowed) {
    res.writeHead(403, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Path not allowed by proxy' }));
    return;
  }

  // Forward to Binance
  const options = {
    hostname: BINANCE,
    port:     443,
    path:     req.url,
    method:   req.method,
    headers: {
      'X-MBX-APIKEY': req.headers['x-mbx-apikey'] || '',
      'User-Agent':   'CryptoFolio/1.0',
    },
  };

  const proxy = https.request(options, binanceRes => {
    const outHeaders = { ...CORS_HEADERS, 'Content-Type': 'application/json' };
    res.writeHead(binanceRes.statusCode, outHeaders);
    binanceRes.pipe(res);
  });

  proxy.on('error', err => {
    console.error('[Proxy] Error:', err.message);
    res.writeHead(502, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy connection failed', details: err.message }));
  });

  req.pipe(proxy);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  CryptoFolio Binance Proxy`);
  console.log(`  ─────────────────────────`);
  console.log(`  Listening on http://localhost:${PORT}`);
  console.log(`  Forwarding to ${BINANCE}`);
  console.log(`  Only allows read-only Binance endpoints`);
  console.log(`  Your API keys go: Browser → this proxy → Binance`);
  console.log(`  ─────────────────────────\n`);
});
