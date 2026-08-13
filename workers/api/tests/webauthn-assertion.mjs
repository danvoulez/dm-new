import assert from 'node:assert/strict';
import { contentHashChallenge, toBase64Url, validateGrantAssertionEnvelope } from '../src/webauthn-challenge.ts';

const grantId = 'ab'.repeat(32);
const expected = contentHashChallenge(grantId);
const encodeClient = (challenge) => toBase64Url(new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get', challenge, origin: 'https://app.carbonlab.work' })));

const good = validateGrantAssertionEnvelope({
  grantId,
  responseId: 'credential-1',
  credentialId: 'credential-1',
  clientDataJSON: encodeClient(expected),
});
assert.equal(good.ok, true);
if (good.ok) assert.equal(good.challenge, expected);

const tampered = validateGrantAssertionEnvelope({
  grantId,
  responseId: 'credential-1',
  credentialId: 'credential-1',
  clientDataJSON: encodeClient(contentHashChallenge('cd'.repeat(32))),
});
assert.deepEqual(tampered, { ok: false, detail: 'grant_challenge_mismatch' });

const wrongCredential = validateGrantAssertionEnvelope({
  grantId,
  responseId: 'credential-attacker',
  credentialId: 'credential-1',
  clientDataJSON: encodeClient(expected),
});
assert.deepEqual(wrongCredential, { ok: false, detail: 'credential_id_mismatch' });

const malformed = validateGrantAssertionEnvelope({
  grantId,
  responseId: 'credential-1',
  credentialId: 'credential-1',
  clientDataJSON: 'not-base64-json',
});
assert.deepEqual(malformed, { ok: false, detail: 'grant_challenge_mismatch' });

console.log('worker WebAuthn assertion envelope: ok');
