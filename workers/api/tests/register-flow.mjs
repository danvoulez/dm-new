import assert from 'node:assert/strict';
import { mintReceipt } from '../src/receipt.ts';
import { evaluate } from '../src/evaluator.ts';
import { RegisterActivationError, registerFlow, registerResponse } from '../src/register-flow.ts';
import { ProposalVerificationError } from '../src/proposal-verifier.ts';
import { SEED_CONTRACTS } from '../src/seed-contracts.ts';

const memorySeed = SEED_CONTRACTS.find((item) => item.process_id === 'memory-register.v1');
assert.ok(memorySeed, 'memory-register.v1 seed must exist');
const catalog = new Map([[memorySeed.process_id, memorySeed.contract]]);
const fakeClient = {};

function fields(overrides = {}) {
  return {
    who: 'operator',
    did: 'registered',
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

async function verified() {
  return { ok: true, checks: ['test'], referenced_hashes: [], process_id: 'memory-register.v1' };
}

function deps(overrides = {}) {
  return {
    verifyProposal: verified,
    append,
    loadCatalog: async () => catalog,
    evaluateReceipt: evaluate,
    selectReceiver: async (_client, _frequency, _limit) => {
      const receipt = await mintReceipt(fields());
      const decision = evaluate(receipt, catalog);
      return [{ hash: receipt.id, evaluation: decision, queued: { queue_id: 'queue:test' }, doubt: null }];
    },
    ...overrides,
  };
}

const activated = await registerFlow(fakeClient, fields(), deps());
const activatedResponse = registerResponse(activated);
assert.equal(activatedResponse.verified, true);
assert.deepEqual(activatedResponse.verification_checks, ['test']);
assert.equal(activatedResponse.registered, true);
assert.equal(activatedResponse.activated, true);
assert.equal(activatedResponse.queued, true);
assert.equal(activatedResponse.process_id, 'memory-register.v1');
assert.equal('waiting' in activatedResponse, false);

// Semantic incompleteness is consequence behavior after append, not admission law.
const incompleteFields = fields({ confirmed_by: '' });
const incompleteReceipt = await mintReceipt(incompleteFields);
const incompleteDecision = evaluate(incompleteReceipt, catalog);
assert.equal(incompleteDecision.reason, 'incomplete');
const waiting = await registerFlow(fakeClient, incompleteFields, deps({
  selectReceiver: async () => [{ hash: incompleteReceipt.id, evaluation: incompleteDecision, queued: null, doubt: 'doubt:test' }],
}));
const waitingResponse = registerResponse(waiting);
assert.equal(waitingResponse.registered, true);
assert.equal(waitingResponse.activated, false);
assert.equal(waitingResponse.queued, false);
assert.equal(waitingResponse.waiting.code, 'incomplete');
assert.deepEqual(waitingResponse.missing, ['confirmed_by']);

const inertFields = fields();
delete inertFields.process_id;
const inert = await registerFlow(fakeClient, inertFields, deps({
  selectReceiver: async () => { throw new Error('inert registration must not reach receiver selection'); },
}));
const inertResponse = registerResponse(inert);
assert.equal(inertResponse.registered, true);
assert.equal(inertResponse.activated, false);
assert.equal(inertResponse.process_id, null);
assert.equal(inertResponse.waiting.code, 'no_process_requested');

// Verification is the membrane: fail-loud and absolutely no append.
let appendCalls = 0;
let rejected;
try {
  await registerFlow(fakeClient, fields({ who: 'mallory' }), deps({
    verifyProposal: async () => {
      throw new ProposalVerificationError('who_identity_mismatch', 'who does not match trusted actor');
    },
    append: async (_client, value) => {
      appendCalls += 1;
      return mintReceipt(value);
    },
  }));
} catch (error) {
  rejected = error;
}
assert.ok(rejected instanceof ProposalVerificationError);
assert.equal(rejected.code, 'who_identity_mismatch');
assert.equal(appendCalls, 0, 'verification failure must happen before persistence');

// Once append succeeds, a later consequence/runtime failure cannot erase the Act.
let persistedFailure;
let persistedAppendCalls = 0;
try {
  await registerFlow(fakeClient, fields({ this: 'memory:persisted' }), deps({
    append: async (_client, value) => {
      persistedAppendCalls += 1;
      return mintReceipt(value);
    },
    loadCatalog: async () => { throw new Error('catalog unavailable'); },
    selectReceiver: async () => [],
  }));
} catch (error) {
  persistedFailure = error;
}
assert.equal(persistedAppendCalls, 1);
assert.ok(persistedFailure instanceof RegisterActivationError);
assert.match(persistedFailure.receipt.id, /^[0-9a-f]{64}$/);
assert.equal(persistedFailure.causeDetail, 'catalog unavailable');

console.log('register flow DoD: proposal -> verify -> append -> consequence');
