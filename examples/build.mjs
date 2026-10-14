// Bundles every example module that defines `main` into examples/output/<Name>.js,
// then writes examples/output/index.html, which links to each bundle.
//   node examples/build.mjs [Name ...]
// Open the index at `?example=<Name>` to run one example (`npm run serve`).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const srcDir = path.join(here, 'src');
const outDir = path.join(here, 'output');
const wanted = process.argv.slice(2);
const spago = path.join(root, 'node_modules', '.bin', 'spago');

const examples = fs.readdirSync(srcDir).sort().filter((file) => file.endsWith('.purs')).flatMap((file) => {
  const name = path.basename(file, '.purs');
  if (/^main\s*::/m.test(fs.readFileSync(path.join(srcDir, file), 'utf8'))) return [name];
  console.log(`skipping ${name}: no main`);
  return [];
});

for (const name of examples) {
  if (wanted.length && !wanted.includes(name)) continue;
  console.log(`bundling ${name}`);
  execFileSync(spago, ['bundle', '-p', 'screamer-examples', '--module', `Screamer.Examples.${name}`, '--outfile', `output/${name}.js`],
    { cwd: root, stdio: 'inherit' });
}

writeIndex(examples.filter((name) => fs.existsSync(path.join(outDir, `${name}.js`))));

// The index lists every bundle present, so a partial build keeps the others linked.
function writeIndex(names) {
  const links = names.map((name) => `      <li><a href="?example=${name}">${name}</a></li>`).join('\n');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Screamer examples</title>
</head>
<body>
  <nav>
    <ul>
${links}
    </ul>
  </nav>
  <main></main>
  <script>
    const examples = ${JSON.stringify(names)};
    const chosen = new URLSearchParams(location.search).get('example');
    if (examples.includes(chosen)) {
      const script = document.createElement('script');
      script.src = chosen + '.js';
      document.body.append(script);
    }
  </script>
</body>
</html>
`;
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  console.log(`wrote output/index.html linking ${names.length} examples`);
}
