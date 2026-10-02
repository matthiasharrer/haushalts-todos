import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldText } from './text.js';

test('foldText ignores case and umlauts', () => {
  assert.equal(foldText('Kühlschrank ABTAUEN'), 'kuhlschrank abtauen');
  assert.equal(foldText('Fußmatte'), 'fussmatte');
  assert.equal(foldText('Ärger Öl'), 'arger ol');
  assert.ok(foldText('Kühlschrank abtauen').includes(foldText('kuhlschrank')));
  assert.ok(foldText('Kuhlschrank').includes(foldText('Kühl')));
});
