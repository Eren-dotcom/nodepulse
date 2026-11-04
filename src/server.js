import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Poller } from './poller.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createServer(poller) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/api/status') {
        // Serialize before writeHead so a stringify failure cannot leave a
        // half-sent 200 response. (GLM QA L4, 2026-11-04.)
        const body = JSON.stringify(poller.status());
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(body);
      } else if (url.pathname === '/api/history') {
        // Validate n: NaN or 0 must not silently return the whole history.
        // (GLM QA L1, 2026-11-04.)
        const raw = Number(url.searchParams.get('n'));
        const n = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), poller.cfg.historyLimit) : 100;
        const body = JSON.stringify(poller.history.slice(-n));
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(body);
      } else if (url.pathname === '/' || url.pathname === '/index.html') {
        const html = await readFile(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
      } else {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
      }
    } catch (e) {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const poller = new Poller({ persistDir: path.join(__dirname, '..', 'data') });
  poller.start();
  const portRaw = Number(process.env.PORT || 4177);
  const port = Number.isInteger(portRaw) && portRaw > 0 && portRaw < 65536 ? portRaw : 4177;
  createServer(poller).listen(port, () => {
    console.log(`NodePulse dashboard: http://localhost:${port}`);
    console.log('Polling Portaldot V3 testnet (read-only RPC) - Ctrl+C to stop');
  });
}
