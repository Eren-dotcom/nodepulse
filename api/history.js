import { sampleOnce } from './_state.js';

export default async function handler(req, res) {
  try {
    const poller = await sampleOnce();
    const raw = Number(req.query?.n);
    const n = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), poller.cfg.historyLimit) : 100;
    res.status(200).json(poller.history.slice(-n));
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
