// Checks the workspace's packaging rules:
//
// - screamer-reactive has no `web-*` package in its dependency closure (test
//   dependencies excluded), so it builds wherever there is no DOM;
// - every packages/*/spago.yaml publishes the same version.
//
// The closure comes from spago.lock, which `spago build` keeps current.
import { readdirSync, readFileSync } from 'node:fs';

let failed = false;
const lock = JSON.parse(readFileSync('spago.lock', 'utf8'));
const workspace = lock.workspace.packages;

function depsOf(name) {
  if (workspace[name]) return workspace[name].core.dependencies;
  return lock.packages[name]?.dependencies ?? [];
}

function closure(root) {
  const seen = new Set();
  const stack = [...depsOf(root)];
  while (stack.length > 0) {
    const name = stack.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    stack.push(...depsOf(name));
  }
  return [...seen].sort();
}

const web = closure('screamer-reactive').filter((name) => name.startsWith('web-'));
if (web.length > 0) {
  console.error(`screamer-reactive depends on ${web.join(', ')}`);
  failed = true;
} else {
  console.log('screamer-reactive has no web-* dependency');
}

const versions = new Map();
for (const dir of readdirSync('packages').sort()) {
  const text = readFileSync(`packages/${dir}/spago.yaml`, 'utf8');
  versions.set(dir, /^\s+version:\s*(\S+)\s*$/m.exec(text)?.[1] ?? '(none)');
}
const distinct = new Set(versions.values());
if (distinct.size !== 1) {
  console.error('packages/*/spago.yaml versions differ:');
  for (const [dir, v] of versions) console.error(`  ${dir}: ${v}`);
  failed = true;
} else {
  console.log(`every package is version ${[...distinct][0]}`);
}

process.exit(failed ? 1 : 0);
