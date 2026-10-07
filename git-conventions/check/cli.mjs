#!/usr/bin/env node
// git-conventions validator CLI. Exit 0 when valid, 1 with messages when not, 2 on usage errors.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  checkBranchName,
  checkCommitSubject,
  checkPrTitle,
  firstMessageLine,
} from './rules.mjs';

const USAGE = `usage:
  node cli.mjs commit-range <base> <head>   check the first line of every commit in <base>..<head>
  node cli.mjs branch-name <name>           check a branch name
  node cli.mjs pr-title <title>             check a PR title (quote it)
  node cli.mjs commit-msg <file> [--merge]  check a commit message file (used by hooks/commit-msg)
exit codes: 0 valid, 1 invalid, 2 usage error`;

const out = (text) => process.stdout.write(`${text}\n`);
const err = (text) => process.stderr.write(`${text}\n`);

function usageError(text) {
  err(`error: ${text}`);
  err(USAGE);
  return 2;
}

function printWarnings(result) {
  for (const warning of result.warnings) err(`warning: ${warning}`);
}

function commitRange(args) {
  if (args.length !== 2) return usageError('commit-range takes <base> and <head>');
  const [base, head] = args;
  if (base.startsWith('-') || head.startsWith('-')) {
    return usageError('<base> and <head> must be revisions, not options');
  }
  let log;
  try {
    log = execFileSync('git', ['log', '--format=%H%x00%P%x00%s', `${base}..${head}`, '--'], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = (error.stderr ? String(error.stderr).trim() : '') || error.message;
    return usageError(`cannot read ${base}..${head}: ${detail}`);
  }
  const commits = log.split('\n').filter((line) => line !== '').map((line) => {
    const [sha, parents, ...subject] = line.split('\0');
    return { sha, parents: parents.split(' ').filter(Boolean), subject: subject.join('\0') };
  });
  let invalid = 0;
  for (const commit of commits) {
    const result = checkCommitSubject(commit.subject, { isMerge: commit.parents.length >= 2 });
    if (!result.ok) {
      invalid += 1;
      err(`${commit.sha.slice(0, 7)} ${result.message}`);
    }
  }
  if (invalid > 0) {
    err(`${invalid} of ${commits.length} commits in ${base}..${head} do not follow the convention`);
    return 1;
  }
  out(`ok: ${commits.length} commit${commits.length === 1 ? '' : 's'} checked in ${base}..${head}`);
  return 0;
}

function oneArg(command, args, label) {
  if (args.length === 1) return null;
  return usageError(`${command} takes exactly one ${label}${args.length > 1 ? ' (quote it)' : ''}`);
}

function report(result, okText) {
  printWarnings(result);
  if (result.ok) {
    out(okText);
    return 0;
  }
  err(result.message);
  return 1;
}

function branchName(args) {
  return oneArg('branch-name', args, 'name')
    ?? report(checkBranchName(args[0]), `ok: branch name "${args[0]}"`);
}

function prTitle(args) {
  return oneArg('pr-title', args, 'title')
    ?? report(checkPrTitle(args[0]), `ok: PR title "${args[0]}"`);
}

function commitMsg(args) {
  const merge = args.includes('--merge');
  const files = args.filter((arg) => arg !== '--merge');
  if (files.length !== 1) return usageError('commit-msg takes one <file> and an optional --merge');
  let text;
  try {
    text = readFileSync(files[0], 'utf8');
  } catch (error) {
    return usageError(`cannot read ${files[0]}: ${error.message}`);
  }
  const line = firstMessageLine(text);
  if (line === null) {
    err('commit message is empty. expected a first line <type>[(scope)][!]: <description>');
    return 1;
  }
  return report(checkCommitSubject(line, { isMerge: merge }), `ok: commit subject "${line}"`);
}

function main(argv) {
  const [command, ...args] = argv;
  switch (command) {
    case 'commit-range': return commitRange(args);
    case 'branch-name': return branchName(args);
    case 'pr-title': return prTitle(args);
    case 'commit-msg': return commitMsg(args);
    case undefined: return usageError('no command given');
    default: return usageError(`unknown command "${command}"`);
  }
}

process.exitCode = main(process.argv.slice(2));
