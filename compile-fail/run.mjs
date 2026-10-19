// Compiles each fixture in this directory against the library and checks
// that it fails with the error code named on its first line
// (`-- expect: <ErrorCode>`), or succeeds for `-- expect: success`. An
// optional `-- mentions: <text>` line requires the error to mention the text.
//
//   node compile-fail/run.mjs        (after `spago build`)
//
// The fixtures live outside the packages' test/ directories so that
// `spago test` does not compile them.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const bin = (name) => path.join(root, 'node_modules', '.bin', name);
const out = path.join(root, '.compile-fail-output');

// Start from the regular build so only the fixture is compiled.
if (!fs.existsSync(out) && fs.existsSync(path.join(root, 'output'))) {
  fs.cpSync(path.join(root, 'output'), out, { recursive: true });
}

const globs = execFileSync(bin('spago'), ['sources', '-p', 'screamer'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  .split('\n')
  .map((s) => s.trim())
  .filter((s) => s && !/(^|\/)test\//.test(s) && !s.startsWith('compile-fail/'));

let failures = 0;
for (const file of fs.readdirSync(here).filter((f) => f.endsWith('.purs')).sort()) {
  const fixture = path.join(here, file);
  const source = fs.readFileSync(fixture, 'utf8');
  const expect = /^-- expect: (\S+)/.exec(source)?.[1];
  const mentions = /^-- mentions: (.+)$/m.exec(source)?.[1];
  if (!expect) {
    console.error(`${file}: missing "-- expect:" line`);
    failures++;
    continue;
  }
  const r = spawnSync(bin('purs'), ['compile', '--json-errors', '--output', out, ...globs, path.relative(root, fixture)], { cwd: root, encoding: 'utf8' });
  let errors = [];
  try {
    errors = JSON.parse(r.stdout.trim().split('\n').pop() || '{}').errors ?? [];
  } catch {
    errors = [];
  }
  const codes = errors.map((e) => e.errorCode);
  const ok = expect === 'success'
    ? r.status === 0
    : r.status !== 0 && codes.includes(expect) && (!mentions || errors.some((e) => e.message.includes(mentions)));
  console.log(`${ok ? 'ok    ' : 'FAILED'} ${file}: expected ${expect}, got ${r.status === 0 ? 'success' : codes.join(', ') || r.stderr.slice(0, 500)}`);
  if (!ok) {
    failures++;
    for (const e of errors.slice(0, 3)) console.log(`  ${e.filename}:${e.position?.startLine}: ${e.message}`);
  }
}
process.exit(failures ? 1 : 0);
