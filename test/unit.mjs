import assert from 'node:assert';
import { blockTimeSec, finalityLag } from '../src/metrics.js';

assert.equal(blockTimeSec({ height: 100, blockTimestamp: 1000 }, { height: 101, blockTimestamp: 1006 }), 6);
assert.equal(blockTimeSec({ height: 100, blockTimestamp: 1000 }, { height: 103, blockTimestamp: 1018 }), 6);
assert.equal(blockTimeSec({ height: 100, blockTimestamp: 1000 }, { height: 100, blockTimestamp: 1006 }), null);
assert.equal(blockTimeSec(null, { height: 101, blockTimestamp: 1006 }), null);
assert.equal(finalityLag(320, 318), 2);
assert.equal(finalityLag(318, 320), 0);
assert.equal(finalityLag(320, null), null);

console.log('unit tests: PASS');
