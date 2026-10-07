import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COMMIT_TYPES,
  checkBranchName,
  checkCommitSubject,
  checkPrTitle,
  firstMessageLine,
  isDefaultMainMerge,
} from './rules.mjs';

function assertOk(result, what) {
  assert.equal(result.ok, true, `${what} should be valid: ${result.message}`);
  assert.deepEqual(result.errors, []);
  assert.equal(result.message, '');
}

function assertInvalid(result, what, needle) {
  assert.equal(result.ok, false, `${what} should be invalid`);
  assert.ok(result.errors.length > 0, `${what} should list an error`);
  assert.match(result.message, /expected /, 'the message says the expected format');
  if (needle) assert.ok(result.message.includes(needle), `"${result.message}" should mention "${needle}"`);
}

describe('branch names', () => {
  const valid = [
    'feature/add-login-page',
    'bugfix/fix-header-bug',
    'hotfix/security-patch',
    'release/v1.2.0',
    'release/v0.3.0-beta.1',
    'release/2.0.0',
    'release/v1.2.3-rc.1',
    'release/next-sprint',
    'chore/update-dependencies',
    'main',
    'master',
    'develop',
    'feature/issue-142-assignment-contract',
    'feature/git-conventions-skill',
  ];
  for (const name of valid) {
    it(`accepts ${name}`, () => assertOk(checkBranchName(name), name));
  }

  const invalid = [
    ['Feature/Add-Login', 'uppercase', 'uppercase'],
    ['feature/new--login', 'double hyphen', 'double hyphen'],
    ['feature/-new-login', 'leading hyphen', 'starts with a hyphen'],
    ['feature/new-login-', 'trailing hyphen', 'ends with a hyphen'],
    ['release/v1.-2.0', 'hyphen next to a dot', 'next to a dot'],
    ['release/v1.2.', 'trailing dot', 'ends with a hyphen or a dot'],
    ['release/v1..2', 'double dot', 'double dot'],
    ['release/.v1', 'leading dot', 'starts with a hyphen or a dot'],
    ['fix/header_bug', 'underscore', 'underscore'],
    ['feature/add login', 'space', 'space'],
    ['docs/old-tickets-audit', 'type not allowed', 'type "docs" is not allowed'],
    ['feature/', 'empty description', 'empty'],
    ['feature/add.login', 'dot outside release', 'dot is allowed only'],
    ['release/foo.bar', 'dot without a version', 'dot is allowed only in a version under release/'],
    ['release/a.b', 'dot without a version', 'dot is allowed only in a version under release/'],
    ['release/add.login', 'dot without a version', 'dot is allowed only in a version under release/'],
    ['release/1.x.final', 'dot without a version', 'dot is allowed only in a version under release/'],
    ['feature/a/b', 'second slash', 'second "/"'],
    ['add-login', 'no prefix', 'no <type>/ prefix'],
    ['Main', 'main in uppercase', 'no <type>/ prefix'],
    ['', 'empty name', 'empty'],
  ];
  for (const [name, why, needle] of invalid) {
    it(`rejects ${JSON.stringify(name)} (${why})`, () => assertInvalid(checkBranchName(name), name, needle));
  }

  it('accepts feat/ and fix/ with a warning to prefer the long form', () => {
    const feat = checkBranchName('feat/add-search');
    assertOk(feat, 'feat/add-search');
    assert.deepEqual(feat.warnings, ['prefer feature/ over feat/']);
    const fix = checkBranchName('fix/header-bug');
    assertOk(fix, 'fix/header-bug');
    assert.deepEqual(fix.warnings, ['prefer bugfix/ over fix/']);
    assert.deepEqual(checkBranchName('feature/add-search').warnings, []);
  });

  it('rejects agent-name prefixes', () => {
    for (const prefix of ['claude', 'codex', 'ai', 'copilot', 'cursor']) {
      assertInvalid(checkBranchName(`${prefix}/add-login`), prefix, 'agent-name prefix');
    }
    assertInvalid(checkBranchName('Claude/add-login'), 'Claude', 'agent-name prefix');
  });

  it('exempts dependabot branches from the name check', () => {
    assertOk(checkBranchName('dependabot/npm_and_yarn/Foo-1.2.3'), 'dependabot npm');
    assertOk(checkBranchName('dependabot/github_actions/actions/checkout-4'), 'dependabot actions');
    assertInvalid(checkBranchName('dependabot/'), 'dependabot/ alone');
    assertInvalid(checkBranchName('dependabotx/foo'), 'other prefix');
  });

  it('reports every problem of a name at once', () => {
    const result = checkBranchName('Feature/New__Login');
    assert.ok(result.errors.length >= 3, result.message);
  });
});

describe('commit subjects', () => {
  const valid = [
    'feat: add the search palette',
    'feat(app): add the search palette',
    'fix(release): handle an empty changelog',
    'feat!: drop the v1 endpoint',
    'feat(api)!: drop the v1 endpoint',
    'refactor(core-utils): split the parser',
    'fix(v2): keep the cursor position',
    'feat(app): add the search palette (#123)',
    'chore: merge origin/main into feature/git-conventions-skill',
    'revert: undo the search palette',
    'docs: explain the SemVer table',
  ];
  for (const subject of valid) {
    it(`accepts ${JSON.stringify(subject)}`, () => assertOk(checkCommitSubject(subject), subject));
  }

  for (const type of COMMIT_TYPES) {
    it(`accepts type ${type}`, () => assertOk(checkCommitSubject(`${type}: do one thing`), type));
  }
  it('knows exactly the eleven types', () => {
    assert.deepEqual(COMMIT_TYPES, [
      'feat', 'fix', 'docs', 'refactor', 'test', 'build', 'ci', 'chore', 'perf', 'style', 'revert',
    ]);
  });

  const invalid = [
    ['Merge pull request #12 from owner/feature/add-login', 'GitHub default', 'GitHub'],
    ['feat:', 'empty description', 'description is empty'],
    ['feat: ', 'blank description', 'description is empty'],
    ['feature: add a thing', 'unknown type', 'type "feature" is not allowed'],
    ['Update the readme', 'no type at all', 'no ":"'],
    ['Update README: fix typo', 'prose before the colon', 'is not allowed'],
    ['feat(App): add a thing', 'uppercase scope', 'lowercase letters, digits and hyphens'],
    ['feat(my_scope): add a thing', 'underscore in scope', 'lowercase letters, digits and hyphens'],
    ['feat(my scope): add a thing', 'space in scope', 'lowercase letters, digits and hyphens'],
    ['feat(): add a thing', 'empty scope', 'scope in parentheses is empty'],
    ['Feat: add a thing', 'uppercase type', 'must be lowercase'],
    ['feat:add a thing', 'no space after colon', 'space is needed'],
    ['feat:  add a thing', 'two spaces after colon', 'more than one space'],
    ['feat(app) add a thing', 'colon missing', 'no ":"'],
    ['feat!(app): add a thing', 'bang before scope', 'cannot read'],
    ['', 'empty subject', 'empty'],
    ["Merge branch 'main' into feature/x", 'git merge subject on a non-merge commit', 'only on a merge commit'],
    ["Merge branch 'feature/other' into feature/x", 'merge of another branch', 'a merge subject must follow the format'],
  ];
  for (const [subject, why, needle] of invalid) {
    it(`rejects ${JSON.stringify(subject)} (${why})`, () => {
      assertInvalid(checkCommitSubject(subject), subject, needle);
    });
  }

  describe('autosquash subjects', () => {
    it('are rejected by default, because they must not be pushed', () => {
      for (const subject of ['fixup! feat: add a thing', 'squash! fix(app): handle null', 'amend! feat: add a thing']) {
        assertInvalid(checkCommitSubject(subject), subject, 'must not be pushed');
        assertInvalid(checkPrTitle(subject), subject, 'must not be pushed');
      }
    });

    it('pass for local work when allowed and the rest is a valid subject', () => {
      for (const subject of [
        'fixup! feat: add a thing',
        'squash! fix(app): handle null',
        'amend! feat: add a thing',
        'fixup! fixup! feat: add a thing',
        'squash! amend! chore: tidy up',
      ]) {
        assertOk(checkCommitSubject(subject, { allowAutosquash: true }), subject);
      }
    });

    it('fail when allowed but the rest is not a valid subject', () => {
      for (const subject of ['fixup! add a thing', 'fixup! ', 'squash! feat:', 'fixup!feat: add a thing']) {
        assertInvalid(checkCommitSubject(subject, { allowAutosquash: true }), subject);
      }
    });
  });

  it('tolerates a trailing carriage return from a Windows message file', () => {
    assertOk(checkCommitSubject('feat: add a thing\r'), 'CRLF subject');
  });
});

describe('merge exception', () => {
  const defaults = [
    "Merge branch 'main' into feature/x",
    "Merge branch 'master' into feature/x",
    "Merge branch 'develop' into feature/x",
    "Merge branch 'develop' of https://github.com/owner/repo into feature/x",
    "Merge branch 'main' of github.com:owner/repo into x",
    "Merge remote-tracking branch 'origin/main' into feature/x",
    "Merge remote-tracking branch 'upstream/develop' into feature/x",
    "Merge branch 'main' into mainline",
  ];
  for (const subject of defaults) {
    it(`passes ${JSON.stringify(subject)} only as a merge commit`, () => {
      assert.equal(isDefaultMainMerge(subject), true);
      assertOk(checkCommitSubject(subject, { isMerge: true }), subject);
      assertInvalid(checkCommitSubject(subject, { isMerge: false }), `${subject} (not a merge)`);
      assertInvalid(checkCommitSubject(subject), `${subject} (default)`);
    });
  }

  const others = [
    "Merge branch 'feature/other' into feature/x",
    "Merge branch 'maintenance' into feature/x",
    "Merge branch 'main-old' into feature/x",
    "Merge remote-tracking branch 'origin/feature/main' into feature/x",
    "Merge remote-tracking branch 'origin/release/v1' into feature/x",
    "Merge branch 'main'",
    "Merge branch 'main' into",
    "Merge branch 'main' into feature/x and more",
    'Merge pull request #12 from owner/feature/add-login',
    "merge branch 'main' into feature/x",
    "Merge branch 'develop' into main",
    "Merge branch 'main' into master",
    "Merge branch 'main' into develop",
    "Merge branch 'develop' of https://example.com/o/r.git into main",
    "Merge remote-tracking branch 'origin/main' into main",
    "Merge branches 'main' and 'develop' into feature/x",
  ];
  for (const subject of others) {
    it(`fails ${JSON.stringify(subject)} even on a merge commit`, () => {
      assert.equal(isDefaultMainMerge(subject), false);
      assertInvalid(checkCommitSubject(subject, { isMerge: true }), subject);
    });
  }

  it('does not apply to PR titles', () => {
    assertInvalid(checkPrTitle("Merge branch 'main' into feature/x"), 'merge subject as a PR title');
  });

  it('keeps a Conventional merge subject valid on a merge commit', () => {
    assertOk(
      checkCommitSubject('chore: merge origin/main into feature/x', { isMerge: true }),
      'sync merge',
    );
    assertOk(checkCommitSubject('feat(app): add the search palette (#123)', { isMerge: true }), 'PR merge');
  });
});

describe('PR titles', () => {
  it('accepts the commit format', () => {
    assertOk(checkPrTitle('feat(git-conventions): add commit and branch conventions'), 'title');
    assertOk(checkPrTitle('fix!: remove the deprecated flag'), 'breaking title');
    assertOk(checkPrTitle('docs: point the git rules at git-conventions'), 'docs title');
  });
  it('rejects what a commit subject rejects', () => {
    assertInvalid(checkPrTitle('Add git conventions'), 'prose title', 'no ":"');
    assertInvalid(checkPrTitle('feature: add git conventions'), 'unknown type');
    assertInvalid(checkPrTitle('feat(Git): add git conventions'), 'uppercase scope');
    assertInvalid(checkPrTitle('feat:'), 'empty description');
  });
  it('labels its message as a PR title', () => {
    assert.match(checkPrTitle('nope').message, /^PR title "nope": /);
    assert.match(checkCommitSubject('nope').message, /^commit subject "nope": /);
    assert.match(checkBranchName('nope').message, /^branch name "nope": /);
  });
});

describe('commit message files', () => {
  const scissors = '# ------------------------ >8 ------------------------';

  it('stops at the scissors line that git commit -v writes', () => {
    const verbose = `\n${scissors}\n# Do not modify or remove the line above.\ndiff --git a/x b/x\n+feat: not a subject\n`;
    assert.equal(firstMessageLine(verbose), null);
    assert.equal(firstMessageLine(`feat: one\n\n${scissors}\ndiff --git a/x b/x\n`), 'feat: one');
    assert.equal(firstMessageLine(`;${scissors.slice(1)}\nfeat: x\n`, { commentChar: ';' }), null);
  });

  it('strips a leading UTF-8 byte order mark', () => {
    assert.equal(firstMessageLine('﻿feat: one\n'), 'feat: one');
    assert.equal(firstMessageLine('﻿# comment\nfeat: one\n'), 'feat: one');
  });

  it('honors another comment character, and none with null', () => {
    assert.equal(firstMessageLine(';comment\nfeat: one', { commentChar: ';' }), 'feat: one');
    assert.equal(firstMessageLine('# not a comment here\nfeat: one', { commentChar: ';' }), '# not a comment here');
    assert.equal(firstMessageLine('# note\nfeat: one', { commentChar: null }), '# note');
  });

  it('takes the first line that is not blank or a comment', () => {
    assert.equal(firstMessageLine('feat: one\n\nbody Line\n'), 'feat: one');
    assert.equal(firstMessageLine('# Please enter\n# more\nfeat: one\n'), 'feat: one');
    assert.equal(firstMessageLine('\n\n  \nfix: two\r\nbody\r\n'), 'fix: two');
    assert.equal(firstMessageLine('# only comments\n\n'), null);
    assert.equal(firstMessageLine(''), null);
  });
});
