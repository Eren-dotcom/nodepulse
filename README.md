# NodePulse

**Live health monitor for Portaldot V3 testnet nodes** — block height, block time,
finality lag, endpoint uptime and alerts, on one dashboard.

Built for **Portaldot Hacker House 2026**, track: **Node Operations & Tooling**.

**Live demo: https://nodepulse-pi.vercel.app** — the dashboard, running against
the real testnet. On Vercel the monitor takes one fresh sample per API request
(serverless); run it locally for continuous 6-second polling.

**Demo video (2:02): https://youtu.be/ZQMimDw0RNo** — a real screencast of the
live dashboard with narration.

## Why NodePulse

Node operators and dApp builders on Portaldot have no simple way to see whether
the testnet is healthy *right now*: Is it producing blocks? How fast? Is finality
keeping up? Is the public RPC endpoint flaky? NodePulse answers all four at a
glance, polling both public endpoints every few seconds.

## Read-only by design — no tPOT, no wallet, no deployment

NodePulse only makes **read-only RPC calls**. It never signs anything and never
sends a transaction, so it needs no funds and no keys to run:

| Endpoint | Calls used |
|---|---|
| EVM RPC `https://test-evm-rpc-v3.portaldot.dev` | `eth_chainId`, `eth_gasPrice`, `eth_getBlockByNumber` (latest + `finalized` tag) |
| Substrate RPC `https://test-node-v3.portaldot.dev` | `system_health`, `chain_getHeader`, `chain_getFinalizedHead` |

Chain pinned: **Portaldot V3 testnet, chain ID 420420777**.

## What it shows

- **Block height** and **average block time** (from consecutive block timestamps)
- **Gas price** (EVM RPC)
- **Finality lag** — latest head vs finalized head, from the Substrate API with an
  EVM `finalized`-tag cross-check
- **Peers / sync state** of the public Substrate node
- **Endpoint uptime %** for both RPC endpoints since the monitor started —
  public RPCs drop requests intermittently, and NodePulse measures exactly that
  (every RPC call is retried with backoff before a sample counts as failed)
- **Alerts**: endpoint down, block-height stall, finality lag above threshold,
  node syncing
- Recent-sample history with a block-time chart; samples are also appended to
  `data/history.jsonl`

## Run it

Requirements: Node.js 18+ (no dependencies to install).

```bash
npm start          # dashboard + poller: http://localhost:4177
npm run once       # print one live sample as JSON and exit
npm test           # offline unit tests (metric math)
npm run smoke      # live smoke test against the real testnet + server
```

Configuration (environment variables):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4177` | dashboard port |
| `POLL_MS` | `6000` | poll interval |
| `EVM_RPC` | Portaldot testnet EVM RPC | EVM endpoint |
| `SUBSTRATE_RPC` | Portaldot testnet node RPC | Substrate endpoint |

## API

- `GET /api/status` — latest sample, endpoint uptime, monitor uptime
- `GET /api/history?n=100` — recent samples (max 500 kept in memory)

## Layout

```
src/rpc.js       JSON-RPC client with retry/backoff (read-only)
src/metrics.js   block-time / finality-lag math (unit-tested)
src/poller.js    polling engine: sampling, uptime tracking, alerts
src/server.js    HTTP server: dashboard + JSON APIs
public/          dashboard (single page, auto-refresh)
test/            unit tests + live smoke test
docs/            demo video script
```

## Status

v0.1 — poller and dashboard working against the live testnet.
Demo video (2:02, recorded 2026-11-04): https://youtu.be/ZQMimDw0RNo —
follows `docs/DEMO-SCRIPT.md`, a real screencast of the live dashboard with
narration.

## License

MIT
