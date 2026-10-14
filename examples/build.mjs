// Bundles every example module that defines `main` into examples/output/<Name>.js,
// then writes examples/output/index.html, which links to each bundle, and
// copies examples/static (the stylesheet) beside it.
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
const staticDir = path.join(here, 'static');
const wanted = process.argv.slice(2);
// Names that splitting at capitals would get wrong.
const titles = { CodeMirror: 'CodeMirror', JsFrameworksBenchmark: 'JS Frameworks Benchmark', WebSocket: 'WebSocket' };
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

fs.cpSync(staticDir, outDir, { recursive: true });
writeIndex(examples.filter((name) => fs.existsSync(path.join(outDir, `${name}.js`))));

function title(name) {
  return titles[name] ?? name.replace(/([a-z])([A-Z])/g, '$1 $2');
}

// The first paragraph of the module's `-- |` header comment, as HTML.
function description(name) {
  const source = fs.readFileSync(path.join(srcDir, `${name}.purs`), 'utf8');
  const header = source.slice(0, source.search(/^module /m)).split('\n')
    .filter((line) => line.startsWith('-- |')).map((line) => line.slice(4).trim());
  const end = header.indexOf('');
  const text = (end === -1 ? header : header.slice(0, end)).join(' ');
  return escape(text).replace(/`([^`]+)`/g, '<code>$1</code>');
}

function escape(text) {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// The index lists every bundle present, so a partial build keeps the others linked.
// With no `?example=` it shows a gallery; with one, it shows that example.
function writeIndex(names) {
  const info = Object.fromEntries(names.map((name) => [name, { title: title(name), description: description(name) }]));
  const cards = names.map((name) => `        <li><a href="?example=${name}">
          <h2>${info[name].title}</h2>
          <p>${info[name].description}</p>
        </a></li>`).join('\n');
  const pills = names.map((name) => `        <a href="?example=${name}" data-name="${name}">${info[name].title}</a>`).join('\n');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Screamer examples</title>
  <link rel="stylesheet" href="examples.css">
  <script>
    // Chosen before the body renders, so the stylesheet shows the right view.
    const examples = ${JSON.stringify(info)};
    const chosen = new URLSearchParams(location.search).get('example');
    if (Object.hasOwn(examples, chosen)) {
      document.documentElement.dataset.example = chosen;
      document.title = examples[chosen].title + ' · Screamer examples';
    }
  </script>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="./">Screamer<span>!</span></a>
    <a class="source" href="https://github.com/blankhart/purescript-screamer">Source on GitHub</a>
  </header>
  <div class="page gallery">
    <section class="gallery-intro">
      <h1>Examples</h1>
      <p>Each example is a PureScript module in <code>examples/src</code>, rendered with Screamer: signals bound straight to the DOM nodes they change, with no virtual DOM.</p>
    </section>
    <ul class="cards">
${cards}
    </ul>
  </div>
  <div class="page example-view">
    <nav class="example-nav">
${pills}
    </nav>
    <section class="example-head">
      <h1></h1>
      <p></p>
    </section>
    <main class="stage"></main>
  </div>
  <script>
    if (document.documentElement.dataset.example) {
      document.querySelector('.example-head h1').textContent = examples[chosen].title;
      document.querySelector('.example-head p').innerHTML = examples[chosen].description;
      document.querySelector(\`.example-nav [data-name="\${chosen}"]\`).setAttribute('aria-current', 'page');
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
