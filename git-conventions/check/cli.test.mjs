import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const CHECK_DIR = dirname(fileURLToPath(import.meta.url));
const CLI = join(CHECK_DIR, 'cli.mjs');
const tempDirs = [];

after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'gcv-'));
  tempDirs.push(dir);
  return dir;
}

// Same environment for every child: node on PATH for the hook, no user or system git config.
function childEnv(scratchDir) {
  const env = { ...process.env };
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
  env[pathKey] = `${dirname(process.execPath)}${delimiter}${env[pathKey] ?? ''}`;
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_CONFIG_GLOBAL = join(scratchDir, 'no-global-gitconfig');
  env.GIT_AUTHOR_NAME = env.GIT_COMMITTER_NAME = 'Test';
  env.GIT_AUTHOR_EMAIL = env.GIT_COMMITTER_EMAIL = 'test@example.com';
  return env;
}

function runCli(args, options = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...options });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

/** A scratch repo on branch main with one valid commit. */
function makeRepo() {
  const dir = makeTempDir();
  const env = childEnv(dir);
  const git = (...args) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8', stdio: 'pipe' });
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'core.autocrlf', 'false');
  git('config', 'commit.gpgsign', 'false');
  const commit = (message) => git('commit', '--quiet', '--allow-empty', '--no-verify', '-m', message);
  commit('chore: start the repository');
  const start = git('rev-parse', 'HEAD').trim();
  return {
    dir,
    env,
    git,
    commit,
    range: (base = start, head = 'HEAD') => runCli(['commit-range', base, head], { cwd: dir, env }),
    subject: () => git('log', '-1', '--format=%s').trim(),
  };
}

describe('exit codes', () => {
  it('returns 0 for a valid branch name and prints it', () => {
    const result = runCli(['branch-name', 'feature/add-login-page']);
    assert.equal(result.code, 0);
    assert.match(result.out, /ok: branch name "feature\/add-login-page"/);
  });

  it('returns 1 with the problem and the expected format for an invalid branch name', () => {
    const result = runCli(['branch-name', 'Feature/Add-Login']);
    assert.equal(result.code, 1);
    assert.match(result.err, /uppercase/);
    assert.match(result.err, /expected <type>\/<description>/);
  });

  it('prints a warning for feat/ and still returns 0', () => {
    const result = runCli(['branch-name', 'feat/add-search']);
    assert.equal(result.code, 0);
    assert.match(result.err, /prefer feature\/ over feat\//);
  });

  it('returns 1 for an empty branch name, as with a detached HEAD', () => {
    const result = runCli(['branch-name', '']);
    assert.equal(result.code, 1);
    assert.match(result.err, /empty/);
  });

  it('returns 0 and 1 for PR titles', () => {
    assert.equal(runCli(['pr-title', 'feat(app): add the search palette (#123)']).code, 0);
    const bad = runCli(['pr-title', 'Add the search palette']);
    assert.equal(bad.code, 1);
    assert.match(bad.err, /expected <type>\[\(scope\)\]\[!\]: <description>, types: feat, fix/);
  });

  it('returns 2 on usage errors', () => {
    for (const args of [
      [],
      ['unknown'],
      ['branch-name'],
      ['branch-name', 'feature/a', 'feature/b'],
      ['pr-title'],
      ['pr-title', 'feat:', 'unquoted', 'title'],
      ['commit-range'],
      ['commit-range', 'main'],
      ['commit-range', '--all', 'HEAD'],
      ['commit-msg'],
    ]) {
      const result = runCli(args);
      assert.equal(result.code, 2, `args ${JSON.stringify(args)}`);
      assert.match(result.err, /usage:/);
    }
  });
});

describe('commit-msg command', () => {
  function checkMessage(text, extraArgs = []) {
    const file = join(makeTempDir(), 'COMMIT_EDITMSG');
    writeFileSync(file, text);
    return runCli(['commit-msg', file, ...extraArgs]);
  }

  it('checks only the first line that is not a comment', () => {
    assert.equal(checkMessage('# a comment\nfeat: add a thing\n\nBody With Anything\n').code, 0);
    assert.equal(checkMessage('\n\nfix(app): handle null\r\nbody\r\n').code, 0);
    const bad = checkMessage('# a comment\nadd a thing\n\nfeat: in the body does not count\n');
    assert.equal(bad.code, 1);
    assert.match(bad.err, /commit subject "add a thing"/);
  });

  it('fails an empty message', () => {
    const result = checkMessage('# only comments\n');
    assert.equal(result.code, 1);
    assert.match(result.err, /empty/);
  });

  it('passes git default merge subjects only with --merge', () => {
    const subject = "Merge branch 'main' into feature/x\n";
    assert.equal(checkMessage(subject, ['--merge']).code, 0);
    assert.equal(checkMessage(subject).code, 1);
    assert.equal(checkMessage("Merge branch 'other' into feature/x\n", ['--merge']).code, 1);
  });

  it('returns 2 for a file that cannot be read', () => {
    assert.equal(runCli(['commit-msg', join(makeTempDir(), 'missing')]).code, 2);
  });
});

describe('commit-range', () => {
  it('passes valid commits, each type and a (#123) suffix', () => {
    const repo = makeRepo();
    repo.commit('feat(app): add the search palette (#123)');
    repo.commit('fix!: drop the legacy flag');
    repo.commit('docs: explain the table');
    const result = repo.range();
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /ok: 3 commits checked in [0-9a-f]{40}\.\.HEAD/);
  });

  it('fails an invalid commit and names its short sha, the problem and the format', () => {
    const repo = makeRepo();
    repo.commit('feat: add one');
    repo.commit('Update the readme');
    const sha = repo.git('rev-parse', '--short=7', 'HEAD').trim();
    const result = repo.range();
    assert.equal(result.code, 1);
    assert.ok(result.err.includes(`${sha} commit subject "Update the readme"`), result.err);
    assert.match(result.err, /expected <type>\[\(scope\)\]\[!\]: <description>/);
    assert.match(result.err, /1 of 2 commits/);
  });

  it('checks only the first line, not the body', () => {
    const repo = makeRepo();
    repo.commit('feat: add one\n\nthis Body is free text\nAnd Has Capitals');
    assert.equal(repo.range().code, 0);
  });

  it('passes an empty range', () => {
    const repo = makeRepo();
    const result = repo.range('HEAD', 'HEAD');
    assert.equal(result.code, 0);
    assert.match(result.out, /ok: 0 commits/);
  });

  it('fails GitHub merge subjects on a merge commit', () => {
    const repo = makeRepo();
    repo.git('checkout', '--quiet', '-b', 'feature/add-login');
    repo.commit('feat: add the login page');
    repo.git('checkout', '--quiet', 'main');
    repo.git('merge', '--quiet', '--no-ff', '--no-verify', '-m', 'Merge pull request #12 from owner/feature/add-login', 'feature/add-login');
    const result = repo.range();
    assert.equal(result.code, 1);
    assert.match(result.err, /GitHub's default merge subject/);
  });

  it("passes git's default merge of main, master and develop into a work branch", () => {
    const repo = makeRepo();
    for (const name of ['master', 'develop']) {
      repo.git('branch', name);
    }
    repo.git('checkout', '--quiet', '-b', 'feature/x');
    repo.commit('feat: work on the branch');
    for (const name of ['main', 'master', 'develop']) {
      repo.git('checkout', '--quiet', name);
      repo.commit(`fix: move ${name} forward`);
      repo.git('checkout', '--quiet', 'feature/x');
      repo.git('merge', '--quiet', '--no-ff', '--no-edit', '--no-verify', name);
      assert.equal(repo.subject(), `Merge branch '${name}' into feature/x`);
    }
    const result = repo.range();
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /ok: 7 commits checked/);
  });

  it('passes the url and remote-tracking forms on a merge commit', () => {
    const repo = makeRepo();
    repo.git('checkout', '--quiet', '-b', 'feature/x');
    repo.commit('feat: work on the branch');
    repo.git('checkout', '--quiet', 'main');
    repo.commit('fix: move main forward');
    repo.git('checkout', '--quiet', 'feature/x');
    repo.git('merge', '--quiet', '--no-ff', '--no-verify', '-m', "Merge branch 'develop' of https://example.com/owner/repo.git into feature/x", 'main');
    repo.git('merge', '--quiet', '--no-ff', '--no-verify', '-m', "Merge remote-tracking branch 'origin/main' into feature/x", 'main');
    const result = repo.range();
    assert.equal(result.code, 0, result.err);
  });

  it('fails the same subject on a commit with one parent', () => {
    const repo = makeRepo();
    repo.commit("Merge branch 'main' into feature/x");
    const result = repo.range();
    assert.equal(result.code, 1);
    assert.match(result.err, /only on a merge commit/);
  });

  it('fails a merge of another branch with git default subject', () => {
    const repo = makeRepo();
    repo.git('checkout', '--quiet', '-b', 'feature/other');
    repo.commit('feat: other work');
    repo.git('checkout', '--quiet', 'main');
    repo.git('checkout', '--quiet', '-b', 'feature/x');
    repo.commit('feat: work on the branch');
    repo.git('merge', '--quiet', '--no-ff', '--no-edit', '--no-verify', 'feature/other');
    assert.equal(repo.subject(), "Merge branch 'feature/other' into feature/x");
    const result = repo.range();
    assert.equal(result.code, 1);
    assert.match(result.err, /Merge branch 'feature\/other' into feature\/x/);
  });

  it('passes a Conventional sync merge subject', () => {
    const repo = makeRepo();
    repo.git('checkout', '--quiet', '-b', 'feature/x');
    repo.commit('feat: work on the branch');
    repo.git('checkout', '--quiet', 'main');
    repo.commit('fix: move main forward');
    repo.git('checkout', '--quiet', 'feature/x');
    repo.git('merge', '--quiet', '--no-ff', '--no-verify', '-m', 'chore: merge origin/main into feature/x', 'main');
    assert.equal(repo.range().code, 0);
  });

  it('returns 2 when git cannot read the range', () => {
    const repo = makeRepo();
    const result = repo.range('no-such-ref', 'HEAD');
    assert.equal(result.code, 2);
    assert.match(result.err, /cannot read no-such-ref\.\.HEAD/);
  });
});

describe('commit-msg hook run by git', () => {
  function makeRepoWithHook() {
    const repo = makeRepo();
    const copy = join(makeTempDir(), 'check');
    cpSync(CHECK_DIR, copy, { recursive: true, filter: (source) => !source.endsWith('.test.mjs') });
    chmodSync(join(copy, 'hooks', 'commit-msg'), 0o755);
    repo.git('config', 'core.hooksPath', join(copy, 'hooks').split('\\').join('/'));
    const tryGit = (...args) => {
      const result = spawnSync('git', args, { cwd: repo.dir, env: repo.env, encoding: 'utf8' });
      return { code: result.status, err: result.stderr, out: result.stdout };
    };
    return { ...repo, tryGit };
  }

  it('accepts a valid message and rejects an invalid one with the expected format', () => {
    const repo = makeRepoWithHook();
    assert.equal(repo.tryGit('commit', '--allow-empty', '-m', 'feat(app): add a thing\n\nBody With Anything').code, 0);
    const bad = repo.tryGit('commit', '--allow-empty', '-m', 'add a thing');
    assert.notEqual(bad.code, 0);
    assert.match(bad.err, /expected <type>\[\(scope\)\]\[!\]: <description>/);
    assert.equal(repo.subject(), 'feat(app): add a thing');
  });

  it("passes git's default merge subject during a merge of main, not on a plain commit", () => {
    const repo = makeRepoWithHook();
    repo.git('checkout', '--quiet', '-b', 'feature/x');
    repo.tryGit('commit', '--allow-empty', '-m', 'feat: work on the branch');
    repo.git('checkout', '--quiet', 'main');
    repo.tryGit('commit', '--allow-empty', '-m', 'fix: move main forward');
    repo.git('checkout', '--quiet', 'feature/x');
    const merge = repo.tryGit('merge', '--no-ff', '--no-edit', 'main');
    assert.equal(merge.code, 0, merge.err);
    assert.equal(repo.subject(), "Merge branch 'main' into feature/x");
    const plain = repo.tryGit('commit', '--allow-empty', '-m', "Merge branch 'main' into feature/x");
    assert.notEqual(plain.code, 0);
  });

  it('rejects git default merge subject of another branch', () => {
    const repo = makeRepoWithHook();
    repo.git('checkout', '--quiet', '-b', 'feature/other');
    repo.tryGit('commit', '--allow-empty', '-m', 'feat: other work');
    repo.git('checkout', '--quiet', 'main');
    repo.git('checkout', '--quiet', '-b', 'feature/x');
    repo.tryGit('commit', '--allow-empty', '-m', 'feat: work on the branch');
    const merge = repo.tryGit('merge', '--no-ff', '--no-edit', 'feature/other');
    assert.notEqual(merge.code, 0);
  });
});
