// Run `spago test -p <name>` for every package in packages/ that has a test
// main, under jsdom, stopping at the first failure. Then run the test mains
// that must pass in plain Node, with no DOM installed.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const setup = './packages/screamer-test/setup-dom.mjs';
const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ${setup}`.trim() };

for (const dir of readdirSync('packages').sort()) {
  const file = `packages/${dir}/spago.yaml`;
  if (!existsSync(file) || !/^\s+test:\s*$/m.test(readFileSync(file, 'utf8'))) continue;
  console.log(`\n== spago test -p ${dir}`);
  const r = spawnSync('npx', ['spago', 'test', '-p', dir], { stdio: 'inherit', env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// Test modules that check code meant to run on a server: built by the
// package's `spago test` above, run here without jsdom.
const plainNode = { 'screamer-web': 'Test.Web.Node' };

for (const [dir, main] of Object.entries(plainNode)) {
  console.log(`\n== ${main} in plain Node (${dir})`);
  const r = spawnSync('node', ['--input-type=module', '-e', `import('./output/${main}/index.js').then((m) => m.main())`], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
