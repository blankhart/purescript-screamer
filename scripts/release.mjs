// Publish the current commit to the `release` branch, with the .js that tsc
// compiles from each FFI .ts. Other branches do not commit that .js.
//
//   node scripts/release.mjs <version> [--push] [--skip-tests]
//
// The release commit has the current commit's tree plus the compiled .js. Its
// parent is the previous release commit, so `release` is a linear history of
// releases. The commit is tagged v<version>. Nothing is pushed without --push.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BRANCH = 'release';
const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith('--'));
const push = args.includes('--push');
const skipTests = args.includes('--skip-tests');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function git(gitArgs, env) {
  return execFileSync('git', gitArgs, { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
}

function run(cmd, cmdArgs) {
  console.log(`\n== ${cmd} ${cmdArgs.join(' ')}`);
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  fail('usage: node scripts/release.mjs <major.minor.patch> [--push] [--skip-tests]');
}
const tag = `v${version}`;

if (git(['status', '--porcelain']) !== '') fail('The working tree has changes; commit or stash them first.');

for (const dir of readdirSync('packages').sort()) {
  const text = readFileSync(`packages/${dir}/spago.yaml`, 'utf8');
  const found = /^\s+version:\s*(\S+)\s*$/m.exec(text)?.[1];
  if (found !== version) {
    fail(`packages/${dir}/spago.yaml is version ${found ?? '(none)'}, not ${version}.\n` +
      `Run \`npm run set-version -- ${version}\` and commit the result first.`);
  }
}

if (git(['tag', '--list', tag]) !== '') fail(`Tag ${tag} already exists.`);

const remoteTag = spawnSync('git', ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`]);
if (remoteTag.status === 0) fail(`Tag ${tag} already exists on origin.`);

if (skipTests) {
  run('npx', ['tsc']);
} else {
  run('npm', ['run', 'build']);
  run('npm', ['test']);
}

// The compiled .js: every packages/*/src/**/*.js with a .ts beside it.
function compiled(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...compiled(path));
    else if (name.endsWith('.js') && existsSync(path.slice(0, -3) + '.ts')) out.push(path);
  }
  return out;
}
const files = readdirSync('packages').flatMap((dir) =>
  existsSync(`packages/${dir}/src`) ? compiled(`packages/${dir}/src`) : []);
if (files.length === 0) fail('tsc compiled no .js.');

const head = git(['rev-parse', 'HEAD']);

let parent = null;
if (spawnSync('git', ['ls-remote', '--exit-code', '--heads', 'origin', BRANCH]).status === 0) {
  git(['fetch', 'origin', `+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`]);
  parent = git(['rev-parse', `refs/remotes/origin/${BRANCH}`]);
} else if (spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${BRANCH}`]).status === 0) {
  parent = git(['rev-parse', `refs/heads/${BRANCH}`]);
}

// Build the tree in a scratch index, leaving the working tree and the real
// index alone.
const index = join(git(['rev-parse', '--absolute-git-dir']), 'release-index');
rmSync(index, { force: true });
const env = { GIT_INDEX_FILE: index };
let tree;
try {
  git(['read-tree', head], env);
  git(['add', '--force', '--', ...files], env);
  tree = git(['write-tree'], env);
} finally {
  rmSync(index, { force: true });
}

const message = `Release ${tag}\n\nFrom ${head}, with the .js compiled from each FFI .ts.`;
const commit = git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message]);
git(['update-ref', `refs/heads/${BRANCH}`, commit]);
git(['tag', '--annotate', tag, commit, '--message', `Release ${tag}`]);
console.log(`\n${BRANCH} is now ${commit}, tagged ${tag}, with ${files.length} compiled .js files.`);

if (push) {
  git(['push', 'origin', `refs/heads/${BRANCH}:refs/heads/${BRANCH}`, `refs/tags/${tag}`]);
  console.log(`Pushed ${BRANCH} and ${tag} to origin.`);
} else {
  console.log(`To publish: git push origin ${BRANCH} ${tag}`);
}
