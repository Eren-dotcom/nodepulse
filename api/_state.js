// Shared poller instance for the Vercel serverless functions.
// On Vercel there is no long-running process, so instead of polling on a
// timer, each API request takes one fresh live sample. Counters and
// history accumulate for as long as the function instance stays warm.
import { Poller } from '../src/poller.js';

let poller = null;

export function getPoller() {
  if (!poller) poller = new Poller();
  return poller;
}

export async function sampleOnce() {
  const p = getPoller();
  await p.sample();
  return p;
}
