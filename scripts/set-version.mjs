// Set one version on every package: each packages/*/spago.yaml, plus the
// root package.json and package-lock.json.
//
//   npm run set-version -- 0.2.0
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('usage: npm run set-version -- <major.minor.patch>');
  process.exit(1);
}

for (const dir of readdirSync('packages').sort()) {
  const file = `packages/${dir}/spago.yaml`;
  const text = readFileSync(file, 'utf8');
  const line = /^([ \t]+version:[ \t]*)\S+/m;
  if (!line.test(text)) {
    console.error(`${file} has no publish version`);
    process.exit(1);
  }
  writeFileSync(file, text.replace(line, `$1${version}`));
}

for (const file of ['package.json', 'package-lock.json']) {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  json.version = version;
  if (json.packages?.['']) json.packages[''].version = version;
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
}

console.log(`every package is now version ${version}`);
