// Bundles every example module that defines `main` into examples/output/<Name>.js.
//   node examples/build.mjs [Name ...]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const wanted = process.argv.slice(2);
const spago = path.join(root, 'node_modules', '.bin', 'spago');

for (const file of fs.readdirSync(path.join(here, 'src')).sort()) {
  const name = path.basename(file, '.purs');
  if (!file.endsWith('.purs') || (wanted.length && !wanted.includes(name))) continue;
  const source = fs.readFileSync(path.join(here, 'src', file), 'utf8');
  if (!/^main\s*::/m.test(source)) {
    console.log(`skipping ${name}: no main`);
    continue;
  }
  console.log(`bundling ${name}`);
  execFileSync(spago, ['bundle', '-p', 'screamer-examples', '--module', `Screamer.Examples.${name}`, '--outfile', `output/${name}.js`],
    { cwd: root, stdio: 'inherit' });
}
