// Minimal JSON-RPC 2.0 client. Read-only by design:
// NodePulse never signs and never sends a transaction.
// Calls are retried with backoff: public RPC endpoints drop requests
// intermittently, and a health monitor should not cry wolf over one drop.
// Only failures that can succeed on a retry are retried (network drops,
// timeouts, HTTP 408/429/5xx). A JSON-RPC error body or a client-error
// status is terminal: retrying it can never help. (GLM QA H2, 2026-11-04.)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function terminal(err) {
  err.terminal = true;
  return err;
}

export async function rpcCall(url, method, params = [], timeoutMs = 6000, attempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        if (!(res.status === 408 || res.status === 429 || res.status >= 500)) throw terminal(err);
        throw err;
      }
      const body = await res.json();
      if (body.error) throw terminal(new Error(`${method}: ${body.error.message || 'rpc error'}`));
      return body.result;
    } catch (e) {
      if (e.terminal) throw e;
      const isTimeout = e.name === 'AbortError';
      const cause = e.cause ? ` (${e.cause.code || e.cause.message || 'network'})` : '';
      lastErr = new Error(isTimeout ? `timeout after ${timeoutMs}ms` : `${e.message}${cause}`);
      if (attempt < attempts) await sleep(400 * attempt);
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr;
}

export const hexToInt = (h) => (typeof h === 'string' ? parseInt(h, 16) : h);
