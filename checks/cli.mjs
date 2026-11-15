#!/usr/bin/env node
// Checks for this repository's own text. Exit 0 when clean, 1 with one line per problem, 2 on a
// usage error. The rules are in rules.mjs.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { checkProse, checkSkillLength, excerptOf, findDashes } from './rules.mjs';

const USAGE = `usage:
  node checks/cli.mjs files                  every tracked file: no em or en dashes; Markdown also
                                             has no stock AI words outside code; SKILL.md line cap
  node checks/cli.mjs commits <base> <head>  the whole message of every commit in <base>..<head>
  node checks/cli.mjs text <label>           text on stdin (a PR title or body), reported as <label>
exit codes: 0 clean, 1 problems found, 2 usage error`;

const FIELD_SEPARATOR = '\x1f';
const NUL_BYTE = 0;
const UNREADABLE = new Set(['ENOENT', 'EISDIR']);

const out = (text) => process.stdout.write(`${text}\n`);
const err = (text) => process.stderr.write(`${text}\n`);

function usageError(text) {
  err(`error: ${text}`);
  err(USAGE);
  return 2;
}

function runGit(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function gitFailure(error) {
  return (error.stderr ? String(error.stderr).trim() : '') || error.message;
}

function describeFindings(label, text, findings) {
  return findings.map((finding) => {
    const place = `${label}:${finding.line}:${finding.column}`;
    return `${place}: ${finding.message}: ${excerptOf(text, finding.line)}`;
  });
}

/** Prints the problems and returns the exit code. */
function report(problems, okText) {
  for (const problem of problems) err(problem);
  if (problems.length > 0) {
    err(`${problems.length} problem${problems.length === 1 ? '' : 's'} found`);
    return 1;
  }
  out(okText);
  return 0;
}

/** A tracked file's text, or null for a binary file, a file deleted on disk or a submodule. */
function readText(file) {
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch (error) {
    if (UNREADABLE.has(error.code)) return null;
    throw error;
  }
  return bytes.includes(NUL_BYTE) ? null : bytes.toString('utf8');
}

function problemsInFile(file) {
  const text = readText(file);
  if (text === null) return [];
  const findings = file.endsWith('.md') ? checkProse(text) : findDashes(text);
  const problems = describeFindings(file, text, findings);
  const lengthProblem = basename(file) === 'SKILL.md' ? checkSkillLength(text) : null;
  if (lengthProblem !== null) problems.push(`${file}: ${lengthProblem}`);
  return problems;
}

function checkFiles(args) {
  if (args.length !== 0) return usageError('files takes no argument: it checks every tracked file');
  let files;
  try {
    files = runGit(['ls-files', '-z']).split('\0').filter((file) => file !== '');
  } catch (error) {
    return usageError(`cannot list tracked files: ${gitFailure(error)}`);
  }
  return report(files.flatMap(problemsInFile), `ok: ${files.length} tracked files checked`);
}

function revisionProblem(name, value) {
  if (value.trim() === '') return `<${name}> is empty (is a variable unset?)`;
  if (value.startsWith('-')) return `<${name}> must be a revision, not an option`;
  return null;
}

/** The commits of base..head, each with its whole raw message. */
function readCommits(base, head) {
  const log = runGit(['log', '-z', '--format=%H%x1f%B', `${base}..${head}`, '--']);
  return log.split('\0').filter((record) => record !== '').map((record) => {
    const [sha, ...message] = record.split(FIELD_SEPARATOR);
    return { sha, message: message.join(FIELD_SEPARATOR) };
  });
}

function checkCommits(args) {
  if (args.length !== 2) return usageError('commits takes <base> and <head>');
  const [base, head] = args;
  const problem = revisionProblem('base', base) ?? revisionProblem('head', head);
  if (problem !== null) return usageError(problem);
  let commits;
  try {
    commits = readCommits(base, head);
  } catch (error) {
    return usageError(`cannot read ${base}..${head}: ${gitFailure(error)}`);
  }
  const problems = commits.flatMap(({ sha, message }) => (
    describeFindings(`commit ${sha.slice(0, 7)}`, message, checkProse(message))
  ));
  const count = `${commits.length} commit message${commits.length === 1 ? '' : 's'}`;
  return report(problems, `ok: ${count} checked in ${base}..${head}`);
}

function checkText(args) {
  if (args.length !== 1 || args[0].trim() === '') return usageError('text takes one <label>');
  const [label] = args;
  const text = readFileSync(process.stdin.fd, 'utf8');
  return report(describeFindings(label, text, checkProse(text)), `ok: ${label}`);
}

function main(argv) {
  const [command, ...args] = argv;
  switch (command) {
    case 'files': return checkFiles(args);
    case 'commits': return checkCommits(args);
    case 'text': return checkText(args);
    case undefined: return usageError('no command given');
    default: return usageError(`unknown command "${command}"`);
  }
}

process.exitCode = main(process.argv.slice(2));
