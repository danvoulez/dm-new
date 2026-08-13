import assert from 'node:assert/strict';
import { mintReceipt } from '../src/receipt.ts';
import { evaluate } from '../src/evaluator.ts';
import { RegisterActivationError, registerFlow, registerResponse } from '../src/register-flow.ts';
import { SEED_CONTRACTS } from '../src/seed-contracts.ts';

const memorySeed = SEED_CONTRACTS.find((item) => item.process_id === 'memory-register.v1');
assert.ok(memorySeed, 'memory-register.v1 seed must exist');
const catalog = new Map([[memorySeed.process_id, memorySeed.contract]]);
const fakeClient = {};

function fields(overrides = {}) {
  return {
    who: 'operator',
    did: 'register',
    this: 'memory:test',
    when: '2026-08-13T08:00:00.000Z',
    confirmed_by: 'operator',
    if_ok: 'memory-register.v1',
    if_doubt: 'attention-raise.v1',
    if_not: 'stop',
    status: 'registered',
    process_id: 'memory-register.v1',
    ...overrides,
  };
}

async function append(_client, value) {
  return mintReceipt(value);
}

const activated = await registerFlow(fakeClient, fields(), {
  append,
  loadCatalog: async () => catalog,
  evaluateReceipt: evaluate,
  selectReceiver: async (_client, _frequency, _limit) => {
    const receipt = await mintReceipt(fields());
    const decision = evaluate(receipt, catalog);
    return [{ hash: receipt.id, evaluation: decision, queued: { queue_id: 'queue:test' }, doubt: null }];
  },
});
const activatedResponse = registerResponse(activated);
assert.equal(activatedResponse.registered, true);
assert.equal(activatedResponse.activated, true);
assert.equal(activatedResponse.queued, true);
assert.equal(activatedResponse.process_id, 'memory-register.v1');
assert.equal('waiting' in activatedResponse, false);

const incompleteFields = fields({ confirmed_by: '' });
const incompleteReceipt = await mintReceipt(incompleteFields);
const incompleteDecision = evaluate(incompleteReceipt, catalog);
assert.equal(incompleteDecision.reason, 'incomplete');
const waiting = await registerFlow(fakeClient, incompleteFields, {
  append,
  loadCatalog: async () => catalog,
  evaluateReceipt: evaluate,
  selectReceiver: async () => [{ hash: incompleteReceipt.id, evaluation: incompleteDecision, queued: null, doubt: 'doubt:test' }],
});
const waitingResponse = registerResponse(waiting);
assert.equal(waitingResponse.registered, true);
assert.equal(waitingResponse.activated, false);
assert.equal(waitingResponse.queued, false);
assert.equal(waitingResponse.waiting.code, 'incomplete');
assert.equal(waitingResponse.waiting.known, true);
assert.equal(waitingResponse.waiting.message, 'Para andar, falta: confirmed_by.');
assert.deepEqual(waitingResponse.missing, ['confirmed_by']);


let persistedFailure;
try {
  await registerFlow(fakeClient, fields({ this: 'memory:persisted' }), {
    append,
    loadCatalog: async () => { throw new Error('catalog unavailable'); },
    evaluateReceipt: evaluate,
    selectReceiver: async () => [],
  });
} catch (error) {
  persistedFailure = error;
}
assert.ok(persistedFailure instanceof RegisterActivationError);
assert.match(persistedFailure.receipt.id, /^[0-9a-f]{64}$/);
assert.equal(persistedFailure.causeDetail, 'catalog unavailable');

console.log('register flow DoD: ok');
