import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadCustodyProcessTypeByHash, outcomeFromStatus } from '../src/process-machine.ts';

const fixtureUrl = new URL(
  '../../../tests/fixtures/santo-andre-vectors/valid/workflow-next-responsible-is-deterministic.json',
  import.meta.url,
);
const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8'));
const typeHash = fixture.workflow.workflow;

const client = {
  async query(sql, params = []) {
    if (sql.includes("did='defined_process_type'") && sql.includes('content_hash=$1')) {
      assert.equal(params[0], typeHash);
      return {
        rows: [{
          process_id: 'santo-andre-card.v1',
          registered_hash: typeHash,
          definition: fixture.workflow,
        }],
      };
    }
    throw new Error(`unexpected query: ${sql}`);
  },
};

const type = await loadCustodyProcessTypeByHash(client, typeHash);
assert.ok(type, 'migrated Santo André workflow must parse as a custody process type');
assert.equal(type.process_id, 'santo-andre-card.v1');
assert.equal(type.start, 'card-table');
assert.equal(type.nodes.get('card-table').responsible, fixture.custody.responsible);
assert.equal(outcomeFromStatus(fixture.routing.outcome), 'ok');

const selected = type.nodes.get('card-table').if_ok;
assert.equal(selected, fixture.routing.expected_next_node);
assert.equal(
  type.nodes.get(selected).responsible,
  fixture.routing.expected_next_responsible,
  'ok branch must deterministically hand custody to the fixture-declared next responsible actor',
);

for (const node of type.nodes.values()) {
  assert.equal('sent_to' in node, false);
  assert.equal('next_if_ok' in node, false);
  assert.equal('next_if_doubt' in node, false);
  assert.equal('next_if_not' in node, false);
}

console.log('Santo Andre fixture: ledger-native custody graph is directly process-machine routable');
