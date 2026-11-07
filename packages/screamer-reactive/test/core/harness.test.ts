import { test } from 'node:test';
import assert from 'node:assert/strict';

test('runs TypeScript tests with gc exposed', () => {
  assert.equal(typeof (globalThis as any).gc, 'function');
});
