import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { setupWith } from '../../../output/Screamer.Test.Setup/index.js';

test('stable compiled bootstrap installs DOM once and only stubs CSS', async () => {
  assert.equal(typeof globalThis.document, 'undefined');
  setupWith({ stubCss: false })();
  const original = document;
  assert.equal(document.location.href, 'http://localhost/');
  const dir = mkdtempSync(join(tmpdir(), 'screamer-setup-'));
  try {
    const css = join(dir, 'view.css');
    writeFileSync(css, '.view { color: red; }');
    await assert.rejects(import(pathToFileURL(css).href), { code: 'ERR_UNKNOWN_FILE_EXTENSION' });
    setupWith({ stubCss: true })();
    setupWith({ stubCss: true })();
    assert.equal(document, original);
    assert.equal((await import(pathToFileURL(css).href + '?stub')).default, '');
    const view = join(dir, 'view.mjs');
    writeFileSync(view, 'import "./view.css?companion"; export const tag = document.createElement("input").tagName;');
    assert.equal((await import(pathToFileURL(view).href)).tag, 'INPUT');
    const other = join(dir, 'unknown.xyz');
    writeFileSync(other, 'not javascript');
    await assert.rejects(import(pathToFileURL(other).href), { code: 'ERR_UNKNOWN_FILE_EXTENSION' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
