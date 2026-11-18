// Tests of installed-check.sh in a throwaway home: a clone of the repo that the links in
// ~/.agents/skills and ~/.claude/skills lead to, and a marketplace clone that the links in
// ~/.config/opencode/skills lead to. No network: origin/main is moved with a fetch from a local seed.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'installed-check.sh');
const ORIGIN_URL = 'https://github.com/emanueledenaro/claude-skills.git';
const SKILLS = ['alpha', 'beta'];
const tempDirs = [];

after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

/** A home with the repo cloned twice, every skill linked into the three roots, all on one commit. */
function makeHome() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'installed-check-')));
  tempDirs.push(base);
  const home = join(base, 'home');
  const env = {
    ...process.env,
    HOME: home,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(base, 'no-global-gitconfig'),
    GIT_AUTHOR_NAME: 'Test', GIT_COMMITTER_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_EMAIL: 'test@example.com',
  };
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: 'pipe' }).trim();
  const write = (file, content) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  };

  const seed = join(base, 'seed');
  mkdirSync(seed);
  git(seed, 'init', '--quiet', '--initial-branch=main');
  for (const id of SKILLS) write(join(seed, id, 'SKILL.md'), `# ${id}\n`);
  write(join(seed, 'README.md'), 'readme\n');
  git(seed, 'add', '.');
  git(seed, 'commit', '--quiet', '--no-verify', '-m', 'chore: start');

  const cloneOf = (dir) => {
    mkdirSync(dirname(dir), { recursive: true });
    git(base, 'clone', '--quiet', '--no-local', seed, dir);
    git(dir, 'remote', 'set-url', 'origin', ORIGIN_URL);
    return dir;
  };
  const clone = cloneOf(join(base, 'repos', 'claude-skills'));
  const market = cloneOf(join(home, '.claude', 'plugins', 'marketplaces', 'emanueledenaro'));
  const roots = {
    opencode: join(home, '.config', 'opencode', 'skills'),
    claude: join(home, '.claude', 'skills'),
    agents: join(home, '.agents', 'skills'),
  };
  for (const root of Object.values(roots)) mkdirSync(root, { recursive: true });
  for (const id of SKILLS) {
    symlinkSync(join(clone, id), join(roots.agents, id));
    symlinkSync(join('..', '..', '.agents', 'skills', id), join(roots.claude, id));
    symlinkSync(join(market, id), join(roots.opencode, id));
  }

  /** Commits in the seed and moves the clone's main and origin/main to it; the marketplace stays behind. */
  const advanceMain = (file, content) => {
    write(join(seed, file), content);
    git(seed, 'add', '.');
    git(seed, 'commit', '--quiet', '--no-verify', '-m', `docs: change ${file}`);
    git(clone, 'fetch', '--quiet', seed, '+main:refs/remotes/origin/main');
    git(clone, 'merge', '--quiet', '--ff-only', 'origin/main');
  };
  /** Brings the marketplace clone to the clone's origin/main, as `claude plugin marketplace update` would. */
  const updateMarket = () => {
    git(market, 'fetch', '--quiet', seed, '+main:refs/remotes/origin/main');
    git(market, 'merge', '--quiet', '--ff-only', 'origin/main');
  };
  /** Replaces the OpenCode link of a skill with a plain copy of the clone's folder. */
  const plainCopy = (id) => {
    rmSync(join(roots.opencode, id));
    cpSync(join(clone, id), join(roots.opencode, id), { recursive: true });
    return join(roots.opencode, id);
  };
  const run = (...args) => {
    const result = spawnSync('bash', [SCRIPT, ...args], { cwd: base, env, encoding: 'utf8' });
    return { code: result.status, out: result.stdout, err: result.stderr };
  };
  const check = () => run(clone);
  return { base, home, seed, clone, market, roots, git, write, advanceMain, updateMarket, plainCopy, run, check };
}

const linesStarting = (out, prefix) => out.split('\n').filter((line) => line.startsWith(prefix));

describe('installed-check.sh', () => {
  it('passes when every copy is on origin/main', () => {
    const h = makeHome();
    const result = h.check();
    assert.equal(result.code, 0, result.out + result.err);
    const short = h.git(h.clone, 'rev-parse', '--short', 'origin/main');
    assert.equal(result.out, `checked against origin/main ${short}\n`);
  });

  it('passes after a merge that changes no skill folder, with the marketplace clone behind', () => {
    const h = makeHome();
    h.advanceMain('README.md', 'readme, changed\n');
    assert.notEqual(h.git(h.market, 'rev-parse', 'HEAD'), h.git(h.clone, 'rev-parse', 'origin/main'));
    const result = h.check();
    assert.equal(result.code, 0, result.out);
    assert.deepEqual(linesStarting(result.out, 'stale'), []);
  });

  it('fails on each copy of a changed skill that a clone behind still loads', () => {
    const h = makeHome();
    h.advanceMain('alpha/SKILL.md', '# alpha, changed\n');
    const result = h.check();
    assert.equal(result.code, 1);
    const at = h.git(h.market, 'rev-parse', '--short', 'HEAD');
    assert.deepEqual(linesStarting(result.out, 'stale'), [`stale: ${h.roots.opencode}/alpha, ${h.market} at ${at}`]);
  });

  it('fails on an uncommitted edit or an untracked file in a clone', () => {
    const h = makeHome();
    appendFileSync(join(h.market, 'alpha', 'SKILL.md'), 'local line\n');
    h.write(join(h.clone, 'beta', 'notes.md'), 'draft\n');
    const result = h.check();
    assert.equal(result.code, 1);
    assert.deepEqual(linesStarting(result.out, 'local edit'), [
      `local edit: ${h.roots.opencode}/alpha in ${h.market}`,
      `local edit: ${h.roots.claude}/beta in ${h.clone}`,
      `local edit: ${h.roots.agents}/beta in ${h.clone}`,
    ]);
  });

  it('fails on a plain copy that differs from origin/main', () => {
    const h = makeHome();
    const copy = h.plainCopy('alpha');
    h.advanceMain('alpha/SKILL.md', '# alpha, changed\n');
    h.updateMarket();
    const result = h.check();
    assert.equal(result.code, 1, result.out);
    assert.deepEqual(linesStarting(result.out, 'stale'), [`stale copy: ${copy} differs from origin/main`]);
  });

  it('reports a plain copy with the content of origin/main, a .DS_Store aside, and passes', () => {
    const h = makeHome();
    const copy = h.plainCopy('alpha');
    writeFileSync(join(copy, '.DS_Store'), 'finder\n');
    const result = h.check();
    assert.equal(result.code, 0, result.out);
    assert.deepEqual(linesStarting(result.out, 'report'), [`report: plain copy ${copy}, same content as origin/main`]);
  });

  it('judges a link to another folder of the repo by content', () => {
    const h = makeHome();
    rmSync(join(h.roots.opencode, 'alpha'));
    symlinkSync(join(h.market, 'beta'), join(h.roots.opencode, 'alpha'));
    const result = h.check();
    assert.equal(result.code, 1, result.out);
    assert.deepEqual(linesStarting(result.out, 'stale'), [`stale copy: ${h.roots.opencode}/alpha differs from origin/main`]);
  });

  it('reports a link into another repo, with or without the same content, and passes', () => {
    const h = makeHome();
    const other = join(h.base, 'other');
    mkdirSync(other);
    h.git(other, 'init', '--quiet', '--initial-branch=main');
    h.write(join(other, 'alpha', 'SKILL.md'), '# alpha\n');
    h.write(join(other, 'beta', 'SKILL.md'), '# beta, kept elsewhere\n');
    for (const id of SKILLS) {
      rmSync(join(h.roots.agents, id));
      symlinkSync(join(other, id), join(h.roots.agents, id));
    }
    const result = h.check();
    assert.equal(result.code, 0, result.out);
    assert.deepEqual(linesStarting(result.out, 'report'), [
      `report: ${h.roots.claude}/alpha is in another repo, ${other}, and same content as origin/main`,
      `report: ${h.roots.agents}/alpha is in another repo, ${other}, and same content as origin/main`,
      `report: ${h.roots.claude}/beta is in another repo, ${other}, and differs from origin/main`,
      `report: ${h.roots.agents}/beta is in another repo, ${other}, and differs from origin/main`,
    ]);
  });

  it('is a usage error without one clone that has origin/main', () => {
    const h = makeHome();
    assert.equal(h.run().code, 2);
    assert.equal(h.run(h.clone, h.clone).code, 2);
    const result = h.run(join(h.base, 'missing'));
    assert.equal(result.code, 2);
    assert.match(result.err, /^error: .* has no origin\/main/);
  });
});
