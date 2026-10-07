import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const CHECK_DIR = dirname(fileURLToPath(import.meta.url));
const CLI = join(CHECK_DIR, 'cli.mjs');
const SCISSORS = '# ------------------------ >8 ------------------------';
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

function runGit({ dir, env }, args, extraEnv = {}) {
  const result = spawnSync('git', args, { cwd: dir, env: { ...env, ...extraEnv }, encoding: 'utf8' });
  return { code: result.status, err: result.stderr, out: result.stdout };
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
    tryGit: (...args) => runGit({ dir, env }, args),
    range: (base = start, head = 'HEAD') => runCli(['commit-range', base, head], { cwd: dir, env }),
    subject: () => git('log', '-1', '--format=%s').trim(),
  };
}

/** Leaves the repo on `branch` with one commit there and one more on main, so a merge is real. */
function divergeMainAndBranch(repo, branch = 'feature/x') {
  repo.git('checkout', '--quiet', '-b', branch);
  repo.commit('feat: work on the branch');
  repo.git('checkout', '--quiet', 'main');
  repo.commit('fix: move main forward');
  repo.git('checkout', '--quiet', branch);
}

function runCommitMsg(repo, text, extraArgs = []) {
  const file = join(makeTempDir(), 'COMMIT_EDITMSG');
  writeFileSync(file, text);
  return runCli(['commit-msg', file, ...extraArgs], { cwd: repo.dir, env: repo.env });
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

  it('returns 2 for an empty or blank base or head, as with an unset CI variable', () => {
    const repo = makeRepo();
    for (const args of [['', 'HEAD'], ['   ', 'HEAD'], ['main', ''], ['main', '  ']]) {
      const result = runCli(['commit-range', ...args], { cwd: repo.dir, env: repo.env });
      assert.equal(result.code, 2, `args ${JSON.stringify(args)}`);
      assert.match(result.err, /is empty/);
      assert.doesNotMatch(result.out, /^ok:/);
    }
  });
});

describe('commit-msg command', () => {
  it('checks only the first line that is not a comment', () => {
    const repo = makeRepo();
    assert.equal(runCommitMsg(repo, '# a comment\nfeat: add a thing\n\nBody With Anything\n').code, 0);
    assert.equal(runCommitMsg(repo, '\n\nfix(app): handle null\r\nbody\r\n').code, 0);
    const bad = runCommitMsg(repo, '# a comment\nadd a thing\n\nfeat: in the body does not count\n');
    assert.equal(bad.code, 1);
    assert.match(bad.err, /commit subject "add a thing"/);
  });

  it('fails an empty message', () => {
    const result = runCommitMsg(makeRepo(), '# only comments\n');
    assert.equal(result.code, 1);
    assert.match(result.err, /empty/);
  });

  it('strips a leading byte order mark', () => {
    assert.equal(runCommitMsg(makeRepo(), '\uFEFFfeat: add a thing\n').code, 0);
  });

  it('reports a message with only a git commit -v scissors block as empty', () => {
    const verbose = `\n${SCISSORS}\n# Do not modify or remove the line above.\ndiff --git a/x b/x\n+feat: not a subject\n`;
    const result = runCommitMsg(makeRepo(), verbose);
    assert.equal(result.code, 1);
    assert.match(result.err, /empty/);
  });

  it('honors core.commentChar, and reads auto as #', () => {
    const repo = makeRepo();
    repo.git('config', 'core.commentChar', ';');
    assert.equal(runCommitMsg(repo, ';a comment\nfeat: add a thing\n').code, 0);
    const notComment = runCommitMsg(repo, '# not a comment here\nfeat: add a thing\n');
    assert.equal(notComment.code, 1);
    assert.match(notComment.err, /commit subject "# not a comment here"/);
    repo.git('config', 'core.commentChar', 'auto');
    assert.equal(runCommitMsg(repo, '# a comment\nfeat: add a thing\n').code, 0);
  });

  it('accepts fixup!, squash! and amend! on a valid subject, not on an invalid one', () => {
    const repo = makeRepo();
    for (const subject of ['fixup! feat(app): add a thing', 'squash! fix: handle null', 'amend! feat: add a thing']) {
      assert.equal(runCommitMsg(repo, `${subject}\n`).code, 0, subject);
    }
    const bad = runCommitMsg(repo, 'fixup! add a thing\n');
    assert.equal(bad.code, 1);
    assert.match(bad.err, /commit subject "fixup! add a thing"/);
  });

  it('passes git default merge subjects only with --merge, and never into main, master or develop', () => {
    const repo = makeRepo();
    const subject = "Merge branch 'main' into feature/x\n";
    assert.equal(runCommitMsg(repo, subject, ['--merge']).code, 0);
    assert.equal(runCommitMsg(repo, subject).code, 1);
    assert.equal(runCommitMsg(repo, "Merge branch 'other' into feature/x\n", ['--merge']).code, 1);
    assert.equal(runCommitMsg(repo, "Merge branch 'develop' into main\n", ['--merge']).code, 1);
  });

  it('sees a merge in progress by itself', () => {
    const repo = makeRepo();
    divergeMainAndBranch(repo);
    const subject = "Merge branch 'main' into feature/x\n";
    assert.equal(runCommitMsg(repo, subject).code, 1);
    repo.git('merge', '--quiet', '--no-ff', '--no-commit', '--no-verify', 'main');
    assert.equal(runCommitMsg(repo, subject).code, 0);
  });

  it('accepts the unchanged default subject when amending a merge commit, not a plain commit', () => {
    const repo = makeRepo();
    divergeMainAndBranch(repo);
    repo.git('merge', '--quiet', '--no-ff', '--no-edit', '--no-verify', 'main');
    assert.equal(runCommitMsg(repo, "Merge branch 'main' into feature/x\n").code, 0);
    assert.equal(runCommitMsg(repo, "Merge branch 'develop' into feature/x\n").code, 1);
    repo.commit("Merge branch 'main' into feature/x");
    assert.equal(runCommitMsg(repo, "Merge branch 'main' into feature/x\n").code, 1);
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

  it('checks the first line itself when line 2 follows without a blank line', () => {
    const repo = makeRepo();
    repo.commit('feat:\nadd the thing');
    assert.equal(repo.git('log', '-1', '--format=%s').trim(), 'feat: add the thing', 'git joins the paragraph');
    const result = repo.range();
    assert.equal(result.code, 1);
    assert.match(result.err, /commit subject "feat:": the description is empty/);
  });

  it('checks a first line that starts with #, as it is not a comment in history', () => {
    const repo = makeRepo();
    repo.commit('# note\nfeat: add the thing');
    const result = repo.range();
    assert.equal(result.code, 1);
    assert.match(result.err, /commit subject "# note"/);
  });

  it('fails fixup!, squash! and amend! commits, which must not be pushed', () => {
    for (const subject of ['fixup! feat: add one', 'squash! feat: add one', 'amend! feat: add one']) {
      const repo = makeRepo();
      repo.commit(subject);
      const result = repo.range();
      assert.equal(result.code, 1, subject);
      assert.match(result.err, /must not be pushed/);
    }
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
    divergeMainAndBranch(repo);
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

  it('fails a merge into main, master or develop even with a default-looking subject', () => {
    const repo = makeRepo();
    repo.git('checkout', '--quiet', '-b', 'develop');
    repo.commit('feat: work on develop');
    repo.git('checkout', '--quiet', 'main');
    repo.git('merge', '--quiet', '--no-ff', '--no-verify', '-m', "Merge branch 'develop' into main", 'develop');
    const result = repo.range();
    assert.equal(result.code, 1);
    assert.match(result.err, /Merge branch 'develop' into main/);
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
    divergeMainAndBranch(repo);
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
  /** A scratch repo whose core.hooksPath is a copy of the hooks folder, with or without cli.mjs next to it. */
  function makeRepoWithHook({ withCli = true } = {}) {
    const repo = makeRepo();
    const copy = join(makeTempDir(), 'check');
    if (withCli) {
      cpSync(CHECK_DIR, copy, { recursive: true, filter: (source) => !source.endsWith('.test.mjs') });
    } else {
      mkdirSync(join(copy, 'hooks'), { recursive: true });
      cpSync(join(CHECK_DIR, 'hooks', 'commit-msg'), join(copy, 'hooks', 'commit-msg'));
    }
    chmodSync(join(copy, 'hooks', 'commit-msg'), 0o755);
    repo.git('config', 'core.hooksPath', join(copy, 'hooks').split('\\').join('/'));
    return repo;
  }

  function commitOk(repo, message) {
    const result = repo.tryGit('commit', '--allow-empty', '-m', message);
    assert.equal(result.code, 0, `commit "${message}" should pass: ${result.err}`);
  }

  it('accepts a valid message and rejects an invalid one with the expected format', () => {
    const repo = makeRepoWithHook();
    commitOk(repo, 'feat(app): add a thing\n\nBody With Anything');
    const bad = repo.tryGit('commit', '--allow-empty', '-m', 'add a thing');
    assert.notEqual(bad.code, 0);
    assert.match(bad.err, /commit subject "add a thing": no ":" after the type/);
    assert.match(bad.err, /expected <type>\[\(scope\)\]\[!\]: <description>/);
    assert.equal(repo.subject(), 'feat(app): add a thing');
  });

  it("passes git's default merge subject during a merge of main, not on a plain commit", () => {
    const repo = makeRepoWithHook();
    repo.git('checkout', '--quiet', '-b', 'feature/x');
    commitOk(repo, 'feat: work on the branch');
    repo.git('checkout', '--quiet', 'main');
    commitOk(repo, 'fix: move main forward');
    repo.git('checkout', '--quiet', 'feature/x');
    const merge = repo.tryGit('merge', '--no-ff', '--no-edit', 'main');
    assert.equal(merge.code, 0, merge.err);
    assert.equal(repo.subject(), "Merge branch 'main' into feature/x");
    commitOk(repo, 'fix: work after the merge');
    const plain = repo.tryGit('commit', '--allow-empty', '-m', "Merge branch 'main' into feature/x");
    assert.notEqual(plain.code, 0);
    assert.match(plain.err, /accepted only on a merge commit/);
  });

  it('rejects the default merge subject of another branch', () => {
    const repo = makeRepoWithHook();
    repo.git('checkout', '--quiet', '-b', 'feature/other');
    commitOk(repo, 'feat: other work');
    repo.git('checkout', '--quiet', 'main');
    repo.git('checkout', '--quiet', '-b', 'feature/x');
    commitOk(repo, 'feat: work on the branch');
    const merge = repo.tryGit('merge', '--no-ff', '--no-edit', 'feature/other');
    assert.notEqual(merge.code, 0);
    assert.match(merge.err, /a merge subject must follow the format/);
  });

  it('keeps the default subject when a merge commit is amended, not when a plain commit is', () => {
    const repo = makeRepoWithHook();
    repo.git('checkout', '--quiet', '-b', 'feature/x');
    commitOk(repo, 'feat: work on the branch');
    repo.git('checkout', '--quiet', 'main');
    commitOk(repo, 'fix: move main forward');
    repo.git('checkout', '--quiet', 'feature/x');
    const merge = repo.tryGit('merge', '--no-ff', '--no-edit', 'main');
    assert.equal(merge.code, 0, merge.err);
    const amend = repo.tryGit('commit', '--amend', '--no-edit', '--allow-empty');
    assert.equal(amend.code, 0, amend.err);
    assert.equal(repo.subject(), "Merge branch 'main' into feature/x");
    repo.git('reset', '--quiet', '--hard', 'HEAD^');
    repo.commit("Merge branch 'main' into feature/x");
    const plainAmend = repo.tryGit('commit', '--amend', '--no-edit', '--allow-empty');
    assert.notEqual(plainAmend.code, 0);
    assert.match(plainAmend.err, /accepted only on a merge commit/);
  });

  it('accepts a fixup! commit on a valid subject and rejects one on an invalid subject', () => {
    const repo = makeRepoWithHook();
    commitOk(repo, 'feat: add a thing');
    commitOk(repo, 'fixup! feat: add a thing');
    const bad = repo.tryGit('commit', '--allow-empty', '-m', 'fixup! add a thing');
    assert.notEqual(bad.code, 0);
    assert.match(bad.err, /commit subject "fixup! add a thing"/);
  });

  it('fails with a clear message, not a stack trace, when cli.mjs is not next to the hooks folder', () => {
    const repo = makeRepoWithHook({ withCli: false });
    const result = repo.tryGit('commit', '--allow-empty', '-m', 'feat: add a thing');
    assert.notEqual(result.code, 0);
    assert.match(result.err, /git-conventions: cli\.mjs not found next to /);
    assert.match(result.err, /git config core\.hooksPath <check>\/hooks/);
    assert.doesNotMatch(result.err, /Cannot find module|at node:/);
  });

  it('warns and lets the commit through when node cannot be found', () => {
    const repo = makeRepoWithHook();
    const result = runGit(repo, ['commit', '--allow-empty', '-m', 'not a conventional subject'], {
      GIT_CONVENTIONS_NODE: 'no-such-node-binary',
    });
    assert.equal(result.code, 0, result.err);
    assert.match(result.err, /git-conventions: node not found, commit message not checked/);
    assert.equal(repo.subject(), 'not a conventional subject');
  });
});
