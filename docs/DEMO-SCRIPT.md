# NodePulse — demo video script (target: under 3 minutes)

Goal: show real, live Portaldot V3 testnet data on screen the whole time.
Record with the dashboard already running (`npm start`, open
http://localhost:4177) so the height is ticking from the first frame.
Pacing rule: no section over 25 seconds; the dashboard is the anchor shot.
(Structure polished 2026-11-04 with arena.ai input, QA-checked against the
verified build facts — no invented numbers.)

| Time | On screen | Say / show |
|---|---|---|
| 0:00–0:10 | Full dashboard, height ticking. On-screen text: "NodePulse — Live health for Portaldot V3" | "The public RPC drops requests. NodePulse does not hide that — watch this block height tick, live, and watch the uptime tell the truth about it." |
| 0:10–0:35 | Stay on dashboard through several polls | "Single-page, read-only dashboard. Every 6 seconds it polls both public RPC endpoints. Block height ticking live, average block time about 6 seconds, peers and sync state." |
| 0:35–1:00 | Finality lag card | "Finality lag is about 2 blocks, cross-checked with the Substrate API and the EVM finalized check — not just the latest block, but how far behind finality the chain is." |
| 1:00–1:25 | Uptime % + alerts | "When a request drops, NodePulse retries with backoff. This uptime percentage measures the real failure rate, endpoint by endpoint, instead of smoothing it away." |
| 1:25–1:50 | Terminal: `npm run once` | "The same check works outside the browser — one command prints one live sample as JSON. It never signs or sends a transaction: no wallet, no keys, no funds needed." |
| 1:50–2:15 | Code view (RPC calls) + README at large zoom | "These are the RPC calls behind the cards, and these are the run instructions. That is the whole setup: read-only polling, nothing to sign." |
| 2:15–2:40 | Back on dashboard | "For Portaldot Hacker House 2026, Node Operations & Tooling track: a feasible read-only tool, an honest take on unreliable public endpoints, and a practical health check for Portaldot V3 testnet." |
| 2:40–3:00 | Live dashboard, height ticking | "NodePulse: live, read-only, and honest about Portaldot V3 health." Stop at 3:00 — no extra feature walkthrough. |

## Recording mistakes to avoid
1. **Never call a frozen screen "live."** Keep the dashboard on screen through
   at least 2–3 polls before moving on; check height, block time and the
   samples table are actually changing before you hit record.
2. **Never hide an RPC drop.** It is the honest hook of the demo. If a request
   fails mid-recording, narrate it once — dropped, retrying with backoff,
   uptime % recording it — and keep going.
3. **Protect the 3:00 budget.** Pre-open dashboard, terminal and code view;
   large zoom; notifications silenced; no unrelated tabs. The common failure
   is still explaining the code view when time runs out.

## Optional dashboard quick wins before recording (CSS only, Nov 5 morning)
- Status pills already in the header (LIVE badge); an uptime bar under each
  endpoint % would make the comparison visible at a glance.
- Everything on one screen at recording resolution; block height is already
  the largest number — keep it that way.
