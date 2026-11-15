import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'cli.mjs');
// Written as code points, never as the characters themselves.
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const tempDirs = [];

after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

// Same environment for every child: no user or system git config.
function childEnv(scratchDir) {
  const env = { ...process.env };
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_CONFIG_GLOBAL = join(scratchDir, 'no-global-gitconfig');
  env.GIT_AUTHOR_NAME = env.GIT_COMMITTER_NAME = 'Test';
  env.GIT_AUTHOR_EMAIL = env.GIT_COMMITTER_EMAIL = 'test@example.com';
  return env;
}

/** A scratch repo on branch main with one clean commit. */
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'skills-check-'));
  tempDirs.push(dir);
  const env = childEnv(dir);
  const git = (...args) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8', stdio: 'pipe' });
  const cli = (args, input = '') => {
    const result = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, env, encoding: 'utf8', input });
    return { code: result.status, out: result.stdout, err: result.stderr };
  };
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'core.autocrlf', 'false');
  git('config', 'commit.gpgsign', 'false');
  const commit = (message) => git('commit', '--quiet', '--allow-empty', '--no-verify', '-m', message);
  commit('chore: start the repository');
  const start = git('rev-parse', 'HEAD').trim();
  /** Writes a file and stages it. */
  const track = (file, content) => {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), content);
    git('add', '--', file);
  };
  return { dir, git, cli, commit, start, track };
}

const linesOf = (count) => `${Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n')}\n`;

describe('files', () => {
  it('passes a clean tree and counts the tracked files', () => {
    const repo = makeRepo();
    repo.track('one/SKILL.md', linesOf(120));
    repo.track('one/tool.mjs', 'export const a = 1;\n');
    const result = repo.cli(['files']);
    assert.equal(result.code, 0, result.err);
    assert.equal(result.out, 'ok: 2 tracked files checked\n');
  });

  it('fails on an em dash in Markdown and shows it as a code point', () => {
    const repo = makeRepo();
    repo.track('one/SKILL.md', `fine\nwake design ${EM} usage\n`);
    const result = repo.cli(['files']);
    assert.equal(result.code, 1);
    assert.match(result.err, /^one\/SKILL\.md:2:13: em dash \(U\+2014\): wake design <U\+2014> usage$/m);
    assert.match(result.err, /^1 problem found$/m);
    assert.ok(!result.err.includes(EM), 'the report repeats the dash itself');
  });

  it('fails on an en dash in a file that is not Markdown', () => {
    const repo = makeRepo();
    repo.track('mods/a/hooks/x.js', `// pages 3${EN}5\n`);
    const result = repo.cli(['files']);
    assert.equal(result.code, 1);
    assert.match(result.err, /^mods\/a\/hooks\/x\.js:1:11: en dash \(U\+2013\)/m);
  });

  it('fails on a stock AI word in Markdown', () => {
    const repo = makeRepo();
    repo.track('one/reference.md', 'This is a pivotal step.\n');
    const result = repo.cli(['files']);
    assert.equal(result.code, 1);
    assert.match(result.err, /^one\/reference\.md:1:11: stock AI word "pivotal": This is a pivotal step\.$/m);
  });

  it('passes a stock AI word quoted as code in Markdown', () => {
    const repo = makeRepo();
    repo.track('one/reference.md', 'Never write `pivotal`.\n\n```\na pivotal line\n```\n');
    assert.equal(repo.cli(['files']).code, 0);
  });

  it('checks stock AI words only in Markdown', () => {
    const repo = makeRepo();
    repo.track('one/words.mjs', "export const WORDS = ['pivotal', 'delve'];\n");
    assert.equal(repo.cli(['files']).code, 0);
  });

  it('fails on a SKILL.md over the line cap, in any folder', () => {
    const repo = makeRepo();
    repo.track('mods/a/skills/b/SKILL.md', linesOf(121));
    const result = repo.cli(['files']);
    assert.equal(result.code, 1);
    assert.match(result.err, /^mods\/a\/skills\/b\/SKILL\.md: 121 lines, the cap is 120: move detail/m);
  });

  it('puts no line cap on other Markdown files', () => {
    const repo = makeRepo();
    repo.track('one/reference.md', linesOf(400));
    assert.equal(repo.cli(['files']).code, 0);
  });

  it('reports every problem and the total', () => {
    const repo = makeRepo();
    repo.track('a.md', `one ${EM} two\n`);
    repo.track('b.md', 'it delves\n');
    const result = repo.cli(['files']);
    assert.equal(result.code, 1);
    assert.match(result.err, /^a\.md:1:5: /m);
    assert.match(result.err, /^b\.md:1:4: /m);
    assert.match(result.err, /^2 problems found$/m);
  });

  it('skips a binary file, a file that is not tracked and a tracked file deleted on disk', () => {
    const repo = makeRepo();
    repo.track('shot.png', Buffer.from([0x89, 0x50, 0x00, 0xe2, 0x80, 0x94]));
    repo.track('gone.md', `one ${EM} two\n`);
    rmSync(join(repo.dir, 'gone.md'));
    writeFileSync(join(repo.dir, 'draft.md'), `one ${EM} two\n`);
    const result = repo.cli(['files']);
    assert.equal(result.code, 0, result.err);
    assert.equal(result.out, 'ok: 2 tracked files checked\n');
  });

  it('is a usage error with an argument or outside a repository', () => {
    const repo = makeRepo();
    assert.equal(repo.cli(['files', 'a.md']).code, 2);
    const outside = spawnSync(process.execPath, [CLI, 'files'], {
      cwd: tmpdir(), env: { ...process.env, GIT_CEILING_DIRECTORIES: tmpdir() }, encoding: 'utf8',
    });
    assert.equal(outside.status, 2);
    assert.match(outside.stderr, /^error: cannot list tracked files: /);
  });
});

describe('commits', () => {
  it('passes clean messages and counts them', () => {
    const repo = makeRepo();
    repo.commit('docs: add a rule');
    repo.commit('docs: add another rule\n\nWith a body.');
    const result = repo.cli(['commits', repo.start, 'HEAD']);
    assert.equal(result.code, 0, result.err);
    assert.equal(result.out, `ok: 2 commit messages checked in ${repo.start}..HEAD\n`);
  });

  it('fails on a dash in a subject and names the commit', () => {
    const repo = makeRepo();
    repo.commit(`docs: add a rule ${EM} and more`);
    const sha = repo.git('rev-parse', '--short=7', 'HEAD').trim();
    const result = repo.cli(['commits', repo.start, 'HEAD']);
    assert.equal(result.code, 1);
    assert.ok(result.err.startsWith(`commit ${sha}:1:18: em dash (U+2014): docs: add a rule <U+2014> and more\n`), result.err);
  });

  it('fails on a stock AI word in a body, with the line inside the message', () => {
    const repo = makeRepo();
    repo.commit('docs: add a rule\n\nThis is a crucial change.');
    const result = repo.cli(['commits', repo.start, 'HEAD']);
    assert.equal(result.code, 1);
    assert.match(result.err, /^commit [0-9a-f]{7}:3:11: stock AI word "crucial": /m);
  });

  it('leaves the commits before <base> alone', () => {
    const repo = makeRepo();
    repo.commit(`docs: old ${EM} message`);
    const base = repo.git('rev-parse', 'HEAD').trim();
    repo.commit('docs: a clean message');
    assert.equal(repo.cli(['commits', base, 'HEAD']).code, 0);
  });

  it('is a usage error for a missing, empty or unknown revision', () => {
    const repo = makeRepo();
    assert.equal(repo.cli(['commits', repo.start]).code, 2);
    assert.match(repo.cli(['commits', '', 'HEAD']).err, /^error: <base> is empty/);
    assert.match(repo.cli(['commits', repo.start, '--all']).err, /^error: <head> must be a revision/);
    const unknown = repo.cli(['commits', 'no-such-rev', 'HEAD']);
    assert.equal(unknown.code, 2);
    assert.match(unknown.err, /^error: cannot read no-such-rev\.\.HEAD: /);
  });
});

describe('text', () => {
  it('passes clean text on stdin', () => {
    const repo = makeRepo();
    const result = repo.cli(['text', 'PR title'], 'docs: add a rule');
    assert.equal(result.code, 0, result.err);
    assert.equal(result.out, 'ok: PR title\n');
  });

  it('fails on a dash and reports it under the label', () => {
    const repo = makeRepo();
    const result = repo.cli(['text', 'PR body'], `## Summary\n\nOne ${EN} two.\n`);
    assert.equal(result.code, 1);
    assert.match(result.err, /^PR body:3:5: en dash \(U\+2013\): One <U\+2013> two\.$/m);
  });

  it('fails on a stock AI word outside code and passes it inside code', () => {
    const repo = makeRepo();
    assert.equal(repo.cli(['text', 'PR body'], 'A vibrant change.').code, 1);
    assert.equal(repo.cli(['text', 'PR body'], 'The word `vibrant` is refused.').code, 0);
  });

  it('passes empty text', () => {
    const repo = makeRepo();
    assert.equal(repo.cli(['text', 'PR body'], '').code, 0);
  });

  it('is a usage error without one label', () => {
    const repo = makeRepo();
    assert.equal(repo.cli(['text']).code, 2);
    assert.equal(repo.cli(['text', 'a', 'b']).code, 2);
  });
});

describe('command line', () => {
  it('is a usage error with no command or an unknown one', () => {
    const repo = makeRepo();
    const none = repo.cli([]);
    assert.equal(none.code, 2);
    assert.match(none.err, /^error: no command given\nusage:/);
    assert.match(repo.cli(['lint']).err, /^error: unknown command "lint"/);
  });
});
