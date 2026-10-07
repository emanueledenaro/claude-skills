// Pure rules for git-conventions: no I/O, no dependencies.
// Every check returns { ok, errors, warnings, message }:
//   errors   the problems found, short
//   warnings advice that does not fail the check
//   message  one line for a person: what is wrong and the expected format ('' when ok)

export const COMMIT_TYPES = [
  'feat', 'fix', 'docs', 'refactor', 'test', 'build', 'ci', 'chore', 'perf', 'style', 'revert',
];
export const BRANCH_TYPES = ['feature', 'bugfix', 'hotfix', 'chore', 'release'];
// Accepted by the Conventional Branch spec and by this validator, not recommended.
export const BRANCH_TYPE_ALIASES = { feat: 'feature', fix: 'bugfix' };
export const AGENT_PREFIXES = ['claude', 'codex', 'ai', 'copilot', 'cursor'];
export const MAIN_BRANCHES = ['main', 'master', 'develop'];

export const COMMIT_EXPECTED =
  `<type>[(scope)][!]: <description>, types: ${COMMIT_TYPES.join(', ')}`;
export const BRANCH_EXPECTED =
  `<type>/<description> with type ${BRANCH_TYPES.join(', ')} (feat, fix also accepted), ` +
  'lowercase words joined by single hyphens, dots only in versions under release/, ' +
  `or ${MAIN_BRANCHES.join(', ')} with no prefix`;

const MAIN_BRANCH_NAMES = MAIN_BRANCHES.join('|');
// Git's own default subject for merging main, master or develop into a work branch:
//   Merge branch 'main' into x
//   Merge branch 'develop' of <url> into x
//   Merge remote-tracking branch 'origin/main' into x
const DEFAULT_MERGE_RE = new RegExp(
  `^Merge (?:branch '(?:${MAIN_BRANCH_NAMES})'(?: of \\S+)?` +
    `|remote-tracking branch '[^'\\s/]+/(?:${MAIN_BRANCH_NAMES})') into \\S+$`,
);
const GITHUB_MERGE_RE = /^Merge pull request #\d+ from /;
const COMMIT_HEAD_RE = /^([^()!]*)(?:\(([^()]*)\))?(!)?$/;
const SCOPE_RE = /^[a-z0-9-]+$/;
const DEPENDABOT_PREFIX = 'dependabot/';

function verdict({ label, value, errors, expected, warnings = [] }) {
  const message = errors.length === 0
    ? ''
    : `${label} "${value}": ${errors.join('; ')}. expected ${expected}`;
  return { ok: errors.length === 0, errors, warnings, message };
}

function commitVerdict(label, line, errors) {
  return verdict({ label, value: line, errors, expected: COMMIT_EXPECTED });
}

function branchVerdict(name, errors, warnings = []) {
  return verdict({ label: 'branch name', value: name, errors, expected: BRANCH_EXPECTED, warnings });
}

function withoutCarriageReturn(text) {
  return String(text ?? '').replace(/\r$/, '');
}

/** True for git's default subject of a merge of main, master or develop into a branch. */
export function isDefaultMainMerge(subject) {
  return DEFAULT_MERGE_RE.test(withoutCarriageReturn(subject));
}

// Subjects that are not in the commit format and get a more specific hint.
function mergeSubjectProblem(line) {
  if (GITHUB_MERGE_RE.test(line)) {
    return "GitHub's default merge subject must be replaced by the PR title followed by the number, " +
      'for example feat(app): add the search palette (#123)';
  }
  if (DEFAULT_MERGE_RE.test(line)) {
    // checkCommitSubject lets this through on a merge commit before getting here
    return "git's default merge subject for main, master or develop is accepted only on a merge commit";
  }
  if (/^Merge /.test(line)) {
    return 'a merge subject must follow the format, for example chore: merge feature/other into feature/x; ' +
      "only git's default merge of main, master or develop into a branch may stay as it is";
  }
  return null;
}

function typeAndScopeProblems(head) {
  const parsed = COMMIT_HEAD_RE.exec(head);
  if (!parsed) return [`cannot read "${head}" as <type>[(scope)][!]`];
  const [, type, scope] = parsed;
  const problems = [];
  if (!COMMIT_TYPES.includes(type)) {
    problems.push(COMMIT_TYPES.includes(type.toLowerCase())
      ? `type "${type}" must be lowercase`
      : `type "${type}" is not allowed`);
  }
  if (scope === '') problems.push('the scope in parentheses is empty');
  else if (scope !== undefined && !SCOPE_RE.test(scope)) {
    problems.push(`scope "${scope}" may only have lowercase letters, digits and hyphens`);
  }
  return problems;
}

function descriptionSpacingProblems(rest) {
  if (rest.trim() === '') return ['the description is empty'];
  if (!rest.startsWith(' ')) return ['a space is needed after the colon'];
  if (rest.startsWith('  ')) return ['there is more than one space after the colon'];
  return [];
}

function commitProblems(line) {
  if (line.trim() === '') return ['the subject is empty'];
  const mergeProblem = mergeSubjectProblem(line);
  if (mergeProblem !== null) return [mergeProblem];
  const colon = line.indexOf(':');
  if (colon === -1) return ['no ":" after the type'];
  return [
    ...typeAndScopeProblems(line.slice(0, colon)),
    ...descriptionSpacingProblems(line.slice(colon + 1)),
  ];
}

/**
 * Checks the first line of a commit message.
 * isMerge is true for a commit with two or more parents: only then does git's default
 * subject for merging main, master or develop into a branch pass.
 */
export function checkCommitSubject(subject, { isMerge = false } = {}) {
  const line = withoutCarriageReturn(subject);
  const passesAsMerge = isMerge && DEFAULT_MERGE_RE.test(line);
  return commitVerdict('commit subject', line, passesAsMerge ? [] : commitProblems(line));
}

/** A PR title has the commit format. The merge exception never applies to it. */
export function checkPrTitle(title) {
  const line = withoutCarriageReturn(title);
  return commitVerdict('PR title', line, commitProblems(line));
}

function branchTypeCheck(type) {
  if (BRANCH_TYPES.includes(type)) return { problems: [], warnings: [] };
  if (Object.hasOwn(BRANCH_TYPE_ALIASES, type)) {
    return { problems: [], warnings: [`prefer ${BRANCH_TYPE_ALIASES[type]}/ over ${type}/`] };
  }
  const lower = type.toLowerCase();
  if (AGENT_PREFIXES.includes(lower)) {
    return {
      problems: [`"${type}/" is an agent-name prefix, not allowed unless the project asks for it`],
      warnings: [],
    };
  }
  const known = [...BRANCH_TYPES, ...Object.keys(BRANCH_TYPE_ALIASES)].includes(lower);
  return {
    problems: [known ? `type "${type}" must be lowercase` : `type "${type}" is not allowed`],
    warnings: [],
  };
}

function descriptionProblems(type, desc) {
  if (desc === '') return ['the description after "/" is empty'];
  const rules = [
    [/\s/, 'it has a space'],
    [/[A-Z]/, 'it has uppercase letters'],
    [/_/, 'it has an underscore'],
    [/\//, 'it has a second "/"'],
    [/--/, 'it has a double hyphen'],
    [/\.\./, 'it has a double dot'],
    [/-\.|\.-/, 'a hyphen is next to a dot'],
    [/^[-.]/, 'it starts with a hyphen or a dot'],
    [/[-.]$/, 'it ends with a hyphen or a dot'],
    [/[^A-Za-z0-9._/\s-]/, 'it has characters other than letters, digits, hyphens and dots'],
  ];
  const problems = rules.filter(([pattern]) => pattern.test(desc)).map(([, text]) => text);
  if (type !== 'release' && desc.includes('.')) {
    problems.push('a dot is allowed only in versions under release/');
  }
  return problems;
}

function isExemptBranch(name) {
  return MAIN_BRANCHES.includes(name) ||
    (name.startsWith(DEPENDABOT_PREFIX) && name.length > DEPENDABOT_PREFIX.length);
}

/** Checks a branch name. main, master, develop and dependabot/... are exempt from the type rule. */
export function checkBranchName(name) {
  const value = String(name ?? '').replace(/\r?\n$/, '');
  if (value === '') return branchVerdict(value, ['the name is empty (detached HEAD?)']);
  if (isExemptBranch(value)) return branchVerdict(value, []);
  const slash = value.indexOf('/');
  if (slash === -1) return branchVerdict(value, ['it has no <type>/ prefix']);
  const type = value.slice(0, slash);
  const { problems, warnings } = branchTypeCheck(type);
  return branchVerdict(value, [...problems, ...descriptionProblems(type, value.slice(slash + 1))], warnings);
}

/**
 * The first line of a commit message file that is neither blank nor a comment, or null.
 * Git strips blank lines at the start and lines starting with the comment character.
 */
export function firstMessageLine(text, commentChar = '#') {
  const lines = String(text).split('\n').map(withoutCarriageReturn);
  const found = lines.find((line) => line.trim() !== '' && !line.startsWith(commentChar));
  return found ?? null;
}
