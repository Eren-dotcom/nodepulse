# NodePulse — Independent Code Review

Scope: `src/rpc.js`, `src/metrics.js`, `src/poller.js`, `src/server.js` (the four files provided; no other repo files were available). Context: zero-dependency Node.js monitor polling the Portaldot V3 testnet (EVM + Substrate JSON-RPC) every 6 s, serving `/api/status` and `/api/history`. Claims marked "verified" were reproduced on Node v24.22.2.

---

## HIGH

### H1. No overlap guard on the poll loop — samples pile up exactly when RPC is slow
`poller.js:146-157` (`start()`), interacting with `rpc.js:8` timeouts.

`setInterval(tick, 6000)` fires unconditionally. Meanwhile the worst case for one `rpcCall` is 15 s timeout × 3 attempts + 0.4/0.8 s backoff ≈ 46 s, and `sampleEvm()` runs three calls in `Promise.all` plus **two sequential** block fetches — ≈ 139 s, i.e. ~23 poll intervals. The moment an endpoint hangs (no RST) instead of erroring fast, ticks overlap, and:

- concurrent `sampleEvm()` calls interleave reads and writes of `this.prevBlock` (`poller.js:44-47`), so block-time deltas are computed against the wrong previous observation;
- uptime counters (`u.total++`/`u.ok++`) are incremented by overlapping samples, unmooring the denominator from wall-clock time;
- history entries are pushed at completion time, so a slow sample lands **after** newer ones and `/api/history` stops being chronological;
- each overlapping sample fires up to 9 more RPC calls at a rate-limited public endpoint — 429s trigger retries (H2), which lengthen samples further. A self-reinforcing spiral during the live demo.

**Fix:** either guard in-flight (`if (this.running) return;` in `tick`, set/cleared in `try/finally`) or replace the interval with a self-scheduling loop that waits for `sample()` to finish and sleeps only the remaining slice of `pollMs`. Cap `timeoutMs` well below `pollMs` (see H2).

### H2. Retry budget (≈45 s per call) is incompatible with a 6 s cadence, and retries fire on errors that can never succeed
`rpc.js:8` (`timeoutMs = 15000`, `attempts = 3`), `rpc.js:20-22`, `rpc.js:27`.

Three problems in one function. (a) 15 s × 3 attempts + backoff ≈ 46 s per call — the root cause of the pileup in H1. (b) The loop retries *everything*: HTTP 4xx (`rpc.js:20`) and JSON-RPC `error` bodies (`rpc.js:22`). A gateway that doesn't implement `system_health` or the `finalized` block tag returns `-32601`/`-32602`, which is terminal, yet it is retried 3× on every one of ~9 calls every 6 s, forever — permanently inflating every sample's latency and load. (c) Linear backoff (400 ms, 800 ms) with no jitter, applied identically by overlapping samples, synchronizes into mini thundering herds; 429 responses are retried just as aggressively as transient drops, which is the wrong posture against public RPC rate limiting.

**Fix:** retry only transient failures — network errors, abort/timeout, HTTP 408/429/5xx. Treat JSON-RPC error objects and other 4xx as terminal. Honor `Retry-After` on 429. Add jitter (e.g. `400 * 2**attempt * (0.5 + Math.random())`). Lower `timeoutMs` to ≤ 5000.

### H3. All-or-nothing sampling mislabels partial failures as "endpoint down"
`poller.js:30-62` (`sampleEvm`), `poller.js:64-88` (`sampleSubstrate`).

Each sample makes 5 (EVM) / 4 (Substrate) calls and a single failure of *any* of them — `eth_gasPrice` throttled, the `finalized` tag unsupported, `system_health` disabled by the gateway — flips the whole sample to `ok:false`, raises `EVM_DOWN`/`SUBSTRATE_DOWN` ("RPC unreachable") and applies the full uptime-percentage penalty, while block production may be perfectly visible on screen. This cries wolf during the demo, which is precisely what the header comment in `rpc.js` says the retry logic exists to avoid. Note the asymmetry: a `null` response for the `finalized` tag is tolerated (`poller.js:42`), but an RPC *error* for the same tag takes the whole sample down.

**Fix:** split core vs optional calls. Core (EVM: block number + its block; Substrate: best header + finalized head) failing → `ok:false`. Optional (chain id, gas price, health) failing → field `null` plus a per-field error string (e.g. `gasPriceError`), sample stays `ok:true` with visible gaps.

---

## MEDIUM

### M1. `POLL_MS=abc` (or `6_000`, or `0`) turns the poller into a 1 ms loop
`poller.js:9` (`Number(process.env.POLL_MS || 6000)`), `poller.js:156`.

`Number('abc')` is NaN and Node clamps a NaN (or `< 1`) interval delay to **1 ms** — verified: fired after ~0–2 ms with `Timeout duration was set to 1`. One env typo during demo prep means thousands of samples per second, 9 RPC calls each: instant rate-limit meltdown, plus shredded uptime denominators. `Number('6_000')` is also NaN (underscores aren't parsed), and `POLL_MS=0`/negative hits the same clamp. Same family in `server.js:38-40`: `PORT=abc` makes `listen(NaN)` bind an ephemeral port while the banner prints `http://localhost:NaN`.

**Fix:** validate at startup, e.g. `const n = Number(process.env.POLL_MS); const pollMs = Number.isFinite(n) && n >= 1000 ? n : 6000;` — same pattern for `PORT`, failing fast with a clear message instead of silently degrading.

### M2. "uptimePct" is a poll-success ratio, not uptime — and the denominator is distorted
`poller.js:132` (`pct`), `poller.js:139-140`.

It is `ok polls / total polls` since process start. A poll that hung 45 s and then succeeded counts identically to an instant success; overlapping samples from H1 inflate `total`; time actually spent down is invisible. A dashboard rendering "Uptime 99.7%" over a demo in which the endpoint was hard-down for several of the last ten minutes will show a number that doesn't survive scrutiny — a wrong-metric problem, not just naming.

**Fix:** cheapest honest option: rename to `successRatePct` and document. Better: also compute time-weighted availability (accumulate up/down milliseconds between consecutive poll completions) and expose both.

### M3. STALL alert re-fires every 6 s for the whole stall; its counter survives outages
`poller.js:96-101`, counter at `poller.js:45-46`.

Once `sameHeightPolls >= stallPolls`, every subsequent poll emits another STALL alert into `sample.alerts`, so history (and any alert pane) floods with duplicates precisely during the incident being demoed. Also, failed EVM polls neither increment nor reset `sameHeightPolls`, so after an outage the count resumes against a stale `prevBlock`.

**Fix:** latch per episode: emit when the threshold is *crossed* (`>= threshold && !this.stallActive`), set `stallActive = true`, clear it when height advances; optionally emit an info-level recovery event.

### M4. First paint: `/api/status` returns `latest: null` for a long, variable window with no signal
`poller.js:19`, `poller.js:131-144`; `server.js:13-15`.

Until the first sample completes — up to ~139 s under H2's worst case — status returns HTTP 200 with `latest: null` and `uptimePct: null`. A dashboard reading `status.latest.evm.height` unguarded throws; one that guards shows a blank board with no explanation. Nothing distinguishes "warming up" from "broken", and the status payload doesn't even include `pollMs`, so the dashboard can't show the expected cadence.

**Fix:** add `ready: this.latest !== null` (or `warmingUp`) to `status()` and render a "waiting for first sample" state; include `pollMs` in the payload.

### M5. Null block lookup (pruned/reorged height) is misreported as "RPC unreachable"
`poller.js:40-43`, analogous `poller.js:73`.

`eth_getBlockByNumber(heightHex)` uses a height observed one round-trip earlier; if the node returns `null` for it (race with a reorg, pruning, provider quirks), `block.timestamp` throws `TypeError: Cannot read properties of null`, the catch converts it to `ok:false`, and the dashboard shows EVM_DOWN with a JS-internal message. Same shape if `finalizedHash` is null in `sampleSubstrate`.

**Fix:** prefer one atomic call — `eth_getBlockByNumber(['latest', false])` yields number + timestamp together, removing both this race and a round-trip per sample. If keeping the current shape, explicitly check `if (!block) throw new Error('block ' + heightHex + ' not returned by RPC')` so the alert text is readable.

### M6. Finality-lag math: sequential reads bias the number downward, and the clamp manufactures a plausible 0
`metrics.js:15`; `poller.js:40-41,54` (EVM), `poller.js:68-75,83` (Substrate).

`height`/`latest` is read a round-trip *before* the finalized head, so lag is understated by however many blocks the chain advanced in between; when the finalized tag passes the stale height the raw difference goes negative and `Math.max(0, ...)` silently reports 0. A monitor should not turn an inconsistent read into a healthy-looking value — during a real finality incident the dashboard under-reports. Related inconsistency: `FINALITY_LAG` alerts exist only for Substrate (`poller.js:102-107`) even though EVM lag is computed and returned.

**Fix:** fetch the head and the finalized block in the same batch (`Promise.all`) so both reads are contemporaneous; keep the raw value and clamp only at display time (or flag `lagInvalid` when negative); apply the lag alert to EVM as well.

---

## LOW

### L1. `/api/history?n=abc` or `?n=0` silently returns the entire 500-entry history
`server.js:17`. `Math.min(NaN, 500)` is NaN (verified), and `slice(-NaN)`/`slice(-0)` both return the whole array (verified). Also reaches into `poller.cfg` — a substitute poller makes `historyLimit` undefined and reproduces the same NaN path. **Fix:** `const raw = Number(v); const n = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), limit) : 100;`

### L2. History order and envelope are undocumented for consumers
`server.js:19`. `slice(-n)` preserves push order, so samples are oldest→newest; a dashboard charting in array order draws time backwards unless it knows to re-sort, and there is no `serverTime`/`count` metadata to anchor it. **Fix:** return newest-first, or wrap as `{samples, order: 'asc', serverTime}` and document it.

### L3. Entry-point guard is fragile (works today, fails silently otherwise)
`server.js:35`, `poller.js:166`. `import.meta.url === \`file://${process.argv[1]}\`` verified on Node 24: matches for plain relative invocation because Node resolves `argv[1]` to an absolute path — but it **fails silently** (main block never runs, exit 0) whenever the path needs URL encoding, e.g. `node ".../NodePulse app/src/server.js"` (verified: `file://…/space dir/g.mjs` vs `…/space%20dir/…`). On older Node versions that don't resolve `argv[1]` it fails for *all* relative invocations. **Fix:** `import.meta.url === pathToFileURL(process.argv[1]).href`.

### L4. Latent double-`writeHead` in the server error path can crash the process
`server.js:13-31`. `res.writeHead(200)` runs before `JSON.stringify(...)` is evaluated inside `res.end(...)`. If serialization ever throws (a BigInt field, a cycle), the catch calls `writeHead` again → `ERR_HTTP_HEADERS_SENT` thrown inside the async handler → unhandledRejection → Node ≥ 15 terminates the process. Currently latent (all payloads are JSON-safe), but it is a reordering away from safe: build body strings first, and guard the catch with `if (!res.headersSent)`.

### L5. Timeouts are indistinguishable in alert text
`rpc.js:24-27`. An exhausted 15 s × 3 budget surfaces as "This operation was aborted", so the EVM_DOWN alert reads as an opaque network failure mid-demo. **Fix:** map `e.name === 'AbortError'` to `timeout after ${timeoutMs}ms (attempt n/${attempts})`.

### L6. Zero-dependency claim silently requires Node ≥ 18
`rpc.js:14` (global `fetch`). On Node 16 every call throws `fetch is not defined`, which the per-sample catch converts into "EVM RPC unreachable: fetch is not defined" — the process looks alive while every metric is down. **Fix:** check `typeof fetch === 'function'` at startup (exit with a clear message) and declare `"engines": { "node": ">=18" }`.

### L7. `hexToInt` edge cases
`rpc.js:35`. `parseInt('', 16)` → NaN propagates silently into history (NaN gaps in charts); `parseInt` also loses precision above 2^53 — fine for heights, timestamps and today's gas prices, a trap if reused for balances. **Fix:** return `null` for non-matches and document the 2^53 ceiling (or BigInt at the boundary).

### L8. Persistence: mkdir + append every sample, and the file is write-only
`poller.js:120-127`. `mkdir` runs on every 6 s sample (wasted syscalls); `history.jsonl` grows unbounded (a few hundred KB per hour — trivial but unbounded) and is never read back, so a restart discards uptime and history anyway. **Fix:** mkdir once in `start()`; either state "session-only" or load the file tail on boot.

### L9. Asymmetric alerting coverage
`poller.js:90-110`. Substrate height is collected but never stall-checked (no equivalent of `sameHeightPolls`), and `health.peers` is collected but a 0-peer (isolated) node raises no alert even though it is exactly the condition the Substrate panel exists to surface. **Fix:** mirror the stall logic for `substrate.latest` and add a `PEERS_LOW` warn.

### L10. Demo-hygiene server defaults
`server.js:39` binds `0.0.0.0` (dashboard published to the LAN); `/api/*` responses carry no `Cache-Control: no-store` (an intermediate proxy may serve stale status during the demo); 500 bodies echo internal paths via `String(e.message)` (e.g. readFile ENOENT); EADDRINUSE prints a raw stack instead of "port 4177 in use". All one-line fixes; none blocking.

---

## Checked and genuinely fine

- `rpc.js:11-30` — `AbortController` with `clearTimeout` in `finally` is correct, including on the retry-sleep path.
- `metrics.js:4-10` — dividing embedded block timestamps by the height delta is the right average, and computing across a failed-poll gap is valid averaging, not a bug.
- `poller.js:42` — null handling of an unsupported `finalized` tag and null-propagation through `finalityLag` is correct.
- `poller.js:118-119` — ring-buffer history with `shift()` at n=500 is fine at this scale.
- `server.js` — no path traversal (only fixed paths are read); all endpoints are read-only; the JSON-RPC client is read-only by construction.
- Embedding per-sample `alerts` in each history entry is a good contract for timeline rendering.
- Swallowing persistence errors (`poller.js:124`) is acceptable for best-effort persistence.
