// Builds the reference apps that need a build step into bench/frameworks/:
// Solid's JSX goes through babel-preset-solid (as krausest's rollup config
// does) and esbuild bundles and minifies it into solid/dist/main.js.
// VanillaJS needs no build and Halogen's bundle is vendored prebuilt.
//   node bench/build.mjs      (`npm run bench` also bundles Screamer)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { transformAsync } from '@babel/core';

const here = path.dirname(fileURLToPath(import.meta.url));
const solid = path.join(here, 'frameworks', 'solid');

const solidJsx = {
  name: 'solid-jsx',
  setup(build) {
    build.onLoad({ filter: /\.jsx$/ }, async (args) => {
      const source = await fs.readFile(args.path, 'utf8');
      const { code } = await transformAsync(source, {
        filename: args.path,
        babelrc: false,
        configFile: false,
        presets: [['solid', { omitNestedClosingTags: true }]],
      });
      return { contents: code, loader: 'js' };
    });
  },
};

console.log('bundling solid');
await esbuild.build({
  entryPoints: [path.join(solid, 'main.jsx')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  minify: true,
  outfile: path.join(solid, 'dist', 'main.js'),
  plugins: [solidJsx],
  logLevel: 'warning',
});
