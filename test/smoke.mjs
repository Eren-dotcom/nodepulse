// Live smoke test: one real sample from the Portaldot testnet,
// then the dashboard server must serve it over /api/status and /.
import { Poller } from '../src/poller.js';
import { createServer } from '../src/server.js';

const poller = new Poller();
await poller.sample();

const server = createServer(poller);
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const status = await fetch(`http://localhost:${port}/api/status`).then((r) => r.json());
const home = await fetch(`http://localhost:${port}/`).then((r) => r.text());
server.close();

if (!status.latest?.evm?.ok || !(status.latest.evm.height > 0)) {
  console.error('SMOKE FAIL: no live EVM sample', JSON.stringify(status.latest));
  process.exit(1);
}
if (!home.includes('NodePulse')) {
  console.error('SMOKE FAIL: dashboard HTML not served');
  process.exit(1);
}
console.log(
  `smoke: PASS height=${status.latest.evm.height} substrateLag=${status.latest.substrate.finalityLag} alerts=${status.latest.alerts.length}`
);
