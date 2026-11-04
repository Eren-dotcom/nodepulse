import { sampleOnce } from './_state.js';

export default async function handler(req, res) {
  try {
    const poller = await sampleOnce();
    res.status(200).json(poller.status());
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
