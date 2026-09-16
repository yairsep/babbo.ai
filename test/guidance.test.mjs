import test from 'node:test';
import assert from 'node:assert/strict';
import { guideFor, nextDue } from '../src/guidance.mjs';
test('ambiguous moments ask a clarifying question before suggesting a commitment', () => {
  const result = guideFor('Today has been difficult');
  assert.equal(result.kind, 'ambiguous');
  assert.equal(result.action, null);
  assert.match(result.response, /what feels hardest/i);
});
test('toddler advice is grounded and exposes its source', () => {
  const result = guideFor('My toddler keeps having tantrums');
  assert.equal(result.kind, 'toddler');
  assert.equal(result.sources.length, 1);
  assert.match(result.sources[0].url, /healthychildren.org/);
});
test('urgent and medical requests route to qualified help without actions', () => {
  assert.match(guideFor('I might hurt my baby').response, /112/);
  assert.equal(guideFor('I might hurt my baby').action, null);
  assert.match(guideFor('My baby has a fever').response, /clinician/);
  assert.equal(guideFor('My baby has a fever').action, null);
});
test('recurring due dates advance', () => {
  assert.equal(nextDue('2026-09-16T10:00:00.000Z','weekly'),'2026-09-23T10:00:00.000Z');
});
