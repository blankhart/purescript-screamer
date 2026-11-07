// Bundles every example in examples/src into
// examples/dist/<Name>.js, where smoke-test.mjs looks for them. Run
// `psx build examples/src` and `spago build` first; this only
// bundles what the compiler left in output/.
//
//   node examples/scripts/build-examples.mjs          build
//   node examples/scripts/build-examples.mjs clean    remove examples/dist

import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const workspace = fileURLToPath(new URL('../..', import.meta.url));
const src = root + 'src/';
const dist = root + 'dist/';

if (process.argv[2] === 'clean') {
  rmSync(dist, { recursive: true, force: true });
  process.exit(0);
}

// The examples are the PSX sources; Harness is a helper.
const names = readdirSync(src)
  .filter((file) => /\.psxt?$/.test(file))
  .map((file) => file.replace(/\.psxt?$/, ''))
  .sort();

mkdirSync(dist, { recursive: true });

for (const name of names) {
  const module = `${workspace}output/Screamer.Psx.Examples.${name}/index.js`;
  if (!existsSync(module)) {
    throw new Error(`Screamer.Psx.Examples.${name} has not been compiled. Run \`psx build\` and \`spago build\` first.`);
  }
  await build({
    stdin: {
      contents: `import { main } from ${JSON.stringify(module)};\nmain();\n`,
      resolveDir: workspace,
    },
    bundle: true,
    minify: true,
    platform: 'browser',
    format: 'iife',
    outfile: `${dist}${name}.js`,
  });
}

console.log(`Built ${names.length} examples into examples/dist`);
