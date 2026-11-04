import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rpcCall, hexToInt } from './rpc.js';
import { blockTimeSec, finalityLag } from './metrics.js';

const pollMsRaw = Number(process.env.POLL_MS || 6000);

export const DEFAULTS = {
  evmRpc: process.env.EVM_RPC || 'https://test-evm-rpc-v3.portaldot.dev',
  substrateRpc: process.env.SUBSTRATE_RPC || 'https://test-node-v3.portaldot.dev',
  // A non-numeric or sub-second POLL_MS would clamp to a 1 ms loop in Node;
  // fall back to 6 s instead. (GLM QA M1, 2026-11-04.)
  pollMs: Number.isFinite(pollMsRaw) && pollMsRaw >= 1000 ? pollMsRaw : 6000,
  historyLimit: 500,
  stallPolls: 3, // consecutive polls at the same height before a STALL alert
  lagAlert: 20, // finality lag (blocks) above this raises a FINALITY_LAG alert
};

// Optional RPC calls resolve to null on failure instead of failing the
// whole sample. (GLM QA H3, 2026-11-04.)
const opt = (p) => p.catch(() => null);

export class Poller {
  constructor(cfg = {}) {
    this.cfg = { ...DEFAULTS, ...cfg };
    this.history = [];
    this.latest = null;
    this.timer = null;
    this.prevBlock = null;
    this.sameHeightPolls = 0;
    this.stallActive = false;
    this._sampling = false;
    this._dirReady = false;
    this.uptime = {
      evm: { ok: 0, total: 0 },
      substrate: { ok: 0, total: 0 },
    };
    this.startedAt = Date.now();
  }

  async sampleEvm() {
    const u = this.uptime.evm;
    u.total++;
    try {
      // Core = the latest block itself: one atomic read carrying height and
      // timestamp (GLM QA M5). The finalized block is fetched in the same
      // batch so lag is not biased by a round-trip gap (M6). Chain ID and
      // gas price are optional: if they fail, the fields are null and the
      // sample still counts as up (H3).
      const [chainIdHex, block, finalizedBlock, gasHex] = await Promise.all([
        opt(rpcCall(this.cfg.evmRpc, 'eth_chainId')),
        rpcCall(this.cfg.evmRpc, 'eth_getBlockByNumber', ['latest', false]),
        opt(rpcCall(this.cfg.evmRpc, 'eth_getBlockByNumber', ['finalized', false])),
        opt(rpcCall(this.cfg.evmRpc, 'eth_gasPrice')),
      ]);
      if (!block) throw new Error("eth_getBlockByNumber('latest') returned null");
      const height = hexToInt(block.number);
      const finalizedHeight = finalizedBlock ? hexToInt(finalizedBlock.number) : null;
      const curr = { height, blockTimestamp: hexToInt(block.timestamp) };
      const bt = blockTimeSec(this.prevBlock, curr);
      if (this.prevBlock && height === this.prevBlock.height) this.sameHeightPolls++;
      else this.sameHeightPolls = 0;
      this.prevBlock = curr;
      u.ok++;
      return {
        ok: true,
        chainId: chainIdHex ? hexToInt(chainIdHex) : null,
        height,
        finalizedHeight,
        finalityLag: finalityLag(height, finalizedHeight),
        gasPriceWei: gasHex ? hexToInt(gasHex) : null,
        blockTimestamp: curr.blockTimestamp,
        blockTimeSec: bt,
      };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }

  async sampleSubstrate() {
    const u = this.uptime.substrate;
    u.total++;
    try {
      // Core = latest + finalized headers. system_health is optional: a
      // gateway that disables it must not mark the endpoint down (H3).
      const [health, latestHeader, finalizedHash] = await Promise.all([
        opt(rpcCall(this.cfg.substrateRpc, 'system_health')),
        rpcCall(this.cfg.substrateRpc, 'chain_getHeader'),
        rpcCall(this.cfg.substrateRpc, 'chain_getFinalizedHead'),
      ]);
      const finalizedHeader = await rpcCall(this.cfg.substrateRpc, 'chain_getHeader', [finalizedHash]);
      const latest = hexToInt(latestHeader.number);
      const finalized = hexToInt(finalizedHeader.number);
      u.ok++;
      return {
        ok: true,
        peers: health ? health.peers : null,
        isSyncing: health ? health.isSyncing : null,
        latest,
        finalized,
        finalityLag: finalityLag(latest, finalized),
      };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }

  alertsFor(sample) {
    const alerts = [];
    if (!sample.evm.ok)
      alerts.push({ level: 'down', code: 'EVM_DOWN', message: `EVM RPC unreachable: ${sample.evm.error}` });
    if (!sample.substrate.ok)
      alerts.push({ level: 'down', code: 'SUBSTRATE_DOWN', message: `Substrate RPC unreachable: ${sample.substrate.error}` });
    // STALL is latched per episode: one alert when the threshold is crossed,
    // not one every poll for the whole stall. (GLM QA M3, 2026-11-04.)
    const stalled = sample.evm.ok && this.sameHeightPolls >= this.cfg.stallPolls;
    if (stalled && !this.stallActive)
      alerts.push({
        level: 'warn',
        code: 'STALL',
        message: `Block height stuck at ${sample.evm.height} for ${this.sameHeightPolls + 1} polls`,
      });
    this.stallActive = stalled;
    if (sample.substrate.ok && sample.substrate.finalityLag != null && sample.substrate.finalityLag > this.cfg.lagAlert)
      alerts.push({
        level: 'warn',
        code: 'FINALITY_LAG',
        message: `Finality lag ${sample.substrate.finalityLag} blocks (threshold ${this.cfg.lagAlert})`,
      });
    if (sample.evm.ok && sample.evm.finalityLag != null && sample.evm.finalityLag > this.cfg.lagAlert)
      alerts.push({
        level: 'warn',
        code: 'FINALITY_LAG',
        message: `EVM finality lag ${sample.evm.finalityLag} blocks (threshold ${this.cfg.lagAlert})`,
      });
    if (sample.substrate.ok && sample.substrate.isSyncing)
      alerts.push({ level: 'warn', code: 'SYNCING', message: 'Node reports it is syncing' });
    return alerts;
  }

  async sample() {
    const [evm, substrate] = await Promise.all([this.sampleEvm(), this.sampleSubstrate()]);
    const sample = { ts: new Date().toISOString(), evm, substrate };
    sample.alerts = this.alertsFor(sample);
    this.latest = sample;
    this.history.push(sample);
    if (this.history.length > this.cfg.historyLimit) this.history.shift();
    if (this.cfg.persistDir) {
      try {
        if (!this._dirReady) {
          await mkdir(this.cfg.persistDir, { recursive: true });
          this._dirReady = true;
        }
        await appendFile(path.join(this.cfg.persistDir, 'history.jsonl'), JSON.stringify(sample) + '\n');
      } catch {
        /* persistence is best-effort */
      }
    }
    return sample;
  }

  status() {
    const pct = (u) => (u.total ? +((u.ok / u.total) * 100).toFixed(1) : null);
    return {
      app: 'NodePulse',
      chain: 'Portaldot V3 testnet',
      startedAt: new Date(this.startedAt).toISOString(),
      uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
      ready: this.latest !== null,
      pollMs: this.cfg.pollMs,
      endpoints: {
        evm: { url: this.cfg.evmRpc, uptimePct: pct(this.uptime.evm), polls: this.uptime.evm.total },
        substrate: { url: this.cfg.substrateRpc, uptimePct: pct(this.uptime.substrate), polls: this.uptime.substrate.total },
      },
      latest: this.latest,
    };
  }

  start() {
    if (this.timer) return;
    const tick = async () => {
      // Never overlap samples: a slow RPC must not pile up concurrent
      // samples that corrupt block-time math and flood the endpoint.
      // (GLM QA H1, 2026-11-04.)
      if (this._sampling) return;
      this._sampling = true;
      try {
        await this.sample();
      } catch {
        /* endpoint errors are captured inside each sample */
      } finally {
        this._sampling = false;
      }
    };
    tick();
    this.timer = setInterval(tick, this.cfg.pollMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

// One-shot CLI: node src/poller.js --once  (prints a single live sample as JSON)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--once')) {
  const p = new Poller();
  const s = await p.sample();
  console.log(JSON.stringify(s, null, 2));
}
