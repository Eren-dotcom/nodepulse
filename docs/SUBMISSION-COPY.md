# NodePulse — DoraHacks submission copy

Prepared 2026-11-04 for Portaldot Hacker House 2026, track: Node Operations
& Tooling. Builder: tofikhashmi2222 (solo, India). Drafted in the AI
fast-build round (Qwen task) and QA-checked line by line against the
verified v0.1 build facts — no invented features or numbers.

## Tagline

Live health monitoring for Portaldot V3 testnet nodes.

## Short description (project card)

NodePulse is a live health monitor for Portaldot V3 testnet nodes (Chain ID
420420777). It polls both public testnet RPC endpoints every 6 seconds and
shows block height, average block time, gas price, finality lag, peers and
sync state, and per-endpoint uptime. It also gives alerts for block stalls,
lag spikes, endpoint outages, and syncing nodes, with a block-time chart and
sample history. It is read-only, so it needs no wallet, keys, or funds.

## Full description (project page)

Problem: Node operators and builders on a testnet need a clear, live view of
network health. A block stall, a rise in finality lag, an endpoint outage,
or a node falling behind while syncing can be easy to miss until another
tool or transaction fails.

Solution: NodePulse is a live health monitor for Portaldot V3 testnet nodes,
built solo by tofikhashmi2222 for the Portaldot Hacker House 2026, Node
Operations & Tooling track. It polls both public Portaldot V3 testnet RPC
endpoints every 6 seconds and shows block height, average block time (about
6 seconds), gas price, finality lag (about 2 blocks), peers and sync state,
per-endpoint uptime, and a block-time chart with sample history. It also
alerts on block stalls, lag spikes, endpoint outages, and nodes that are
syncing.

How it works: NodePulse cross-checks finality using two RPC families: the
Substrate API and the EVM finalized tag, so a single endpoint or view does
not decide the result. It is read-only: it never signs or sends a
transaction and needs no wallet, keys, or funds. Chain ID is 420420777.

A useful finding from building it is that the public RPC drops requests
intermittently. NodePulse therefore retries every call with backoff, and
its per-endpoint uptime percentage measures the real failure rate instead
of hiding it.

How to run it: NodePulse has zero dependencies, requires Node.js 18 or
later, and runs with npm start. Its GitHub repository includes a README and
run instructions. Unit tests and a live smoke test pass.

Why it helps Portaldot: it gives operators a simple way to check testnet
health, compare endpoints, and spot stalls, lag, and outages early, without
risking funds or keys.

Limitation: NodePulse is a live-data tool, not a deployed smart contract.

## Built with

Node.js, JavaScript, Substrate JSON-RPC API, Ethereum JSON-RPC API, HTML/CSS
