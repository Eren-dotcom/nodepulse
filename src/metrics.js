// Pure metric helpers, unit-tested in test/unit.mjs.

// Average seconds per block between two block observations.
export function blockTimeSec(prev, curr) {
  if (!prev || !curr) return null;
  const dh = curr.height - prev.height;
  const dt = curr.blockTimestamp - prev.blockTimestamp;
  if (dh <= 0 || dt <= 0) return null;
  return +(dt / dh).toFixed(2);
}

// Blocks between the latest head and the finalized head.
export function finalityLag(latest, finalized) {
  if (latest == null || finalized == null) return null;
  return Math.max(0, latest - finalized);
}
