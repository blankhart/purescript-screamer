// Runs the PSX suite on this workspace's apps, against the canonical
// contracts in the pinned PSX checkout. Run from psx/ after `spago build`.
import { readFileSync, existsSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
const lock = JSON.parse(readFileSync('spago.lock', 'utf8'));
const ref = lock.packages['psx-suite'].rev;
const root = process.env.PSX_SUITE_CONTRACT_ROOT || resolve('.spago/p/psx-suite', ref);
if (!existsSync(root + '/test/suite/scenarios')) throw new Error('Missing PSX suite contracts: run spago install');
// The suite runs purs-backend-es and spago from ./node_modules/.bin; the
// packages are installed at the repository root.
if (!existsSync('node_modules')) symlinkSync('../node_modules', 'node_modules', 'dir');
process.env.PSX_SUITE_CONTRACT_ROOT = root;
process.env.PSX_SUITE_CLI = 'scripts/psx.mjs';
const { main } = await import('../output/Suite.Main/index.js');
main();
