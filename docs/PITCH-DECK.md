# NodePulse — pitch deck (DRAFT, prepared 2026-11-04 evening IST)

For Portaldot Hacker House 2026, track: **Node Operations & Tooling**.
Status: draft text only — not yet designed, not yet submitted. Every number
below is from the verified v0.1 build; do not change a number without a fresh
live check.

## Slide 1 — Title
**NodePulse — Portaldot testnet health at a glance**
Live node health monitor for Portaldot V3 testnet. Built by tofikhashmi2222.
DoraHacks: https://dorahacks.io/builder/u_dd516422190a13

## Slide 2 — Problem
Node operators and dApp builders on Portaldot have no simple way to see
whether the testnet is healthy *right now*: Is it producing blocks? How fast?
Is finality keeping up? Is the public RPC endpoint flaky?

## Slide 3 — Solution
One dashboard, polling both public endpoints every 6 seconds:
- Block height + average block time
- Gas price
- Finality lag (latest head vs finalized head)
- Peers / sync state
- Per-endpoint uptime %
- Alerts: stall, lag spike, endpoint down, node syncing
- Block-time chart + recent-sample history

## Slide 4 — Live proof (verified 2026-11-04 evening IST)
- Chain: Portaldot V3 testnet, chain ID 420420777
- Block height ticking: 320,791 at last check
- Block time: steady ~6 seconds
- Finality lag: ~2 blocks, cross-checked two ways (Substrate API + EVM
  `finalized` tag)
- Unit tests pass; live smoke test passes; dashboard serves real data

## Slide 5 — Read-only by design (the honest edge)
NodePulse only makes read-only RPC calls. It never signs anything and never
sends a transaction — so it needs no wallet, no keys, no tPOT to run.
- EVM RPC: `eth_chainId`, `eth_blockNumber`, `eth_gasPrice`,
  `eth_getBlockByNumber` (incl. `finalized` tag)
- Substrate RPC: `system_health`, `chain_getHeader`, `chain_getFinalizedHead`
Honest caveat for judges: this is a live-data tool, not a deployed contract,
so it is weaker on on-chain interaction than a deployed DApp — and stronger
on being runnable by anyone in minutes.

## Slide 6 — The find that became a feature
The public RPC drops requests intermittently. NodePulse retries every call
with backoff before a sample counts as failed, so its uptime % measures the
real failure rate instead of hiding it.

## Slide 7 — How to run it (zero dependencies)
Node.js 18+ only, no packages to install:
`npm start` → dashboard at http://localhost:4177
`npm run once` → one live sample as JSON · `npm test` → offline unit tests
APIs: `GET /api/status`, `GET /api/history?n=100`

## Slide 8 — Why it helps Portaldot (Ecosystem)
Node tooling is the track's own need: healthier nodes mean fewer silent
failures for every builder on the testnet. Open source (MIT), small enough
to keep building after the hackathon — next steps: multi-node tracking,
alert webhooks, longer history.

## Slide 9 — Ask / close
NodePulse: Portaldot testnet health at a glance — live, read-only, runnable
in minutes. Demo video (≤3 min) shows the live dashboard; script in
`docs/DEMO-SCRIPT.md`.

---
## Remaining before submission (deadline Nov 6, 09:30 IST)
1. Push this repo public on GitHub (currently local-only, 4 commits, Nov 4
   evening — outside the final-24h window that starts Nov 5, 09:30 IST)
2. Design this deck from the draft above (or hand it to a logged-in AI for
   a design pass — user approved all logged-in AIs for NodePulse)
3. Record the ≤3 min demo video from `docs/DEMO-SCRIPT.md`
4. Submit on DoraHacks with repo link + deck + video
