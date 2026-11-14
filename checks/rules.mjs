// Pure rules for the text of this repository: no I/O, no dependencies.
// A finding is { line, column, message }, both numbers starting at 1.

/** The house range for a SKILL.md is 40 to 120 lines (skill-audit, section 2). */
export const SKILL_LINE_CAP = 120;

// Written as code points, so this file passes its own check.
const DASH_NAMES = { '\u2014': 'em dash (U+2014)', '\u2013': 'en dash (U+2013)' };
const DASH_CODES = { '\u2014': '<U+2014>', '\u2013': '<U+2013>' };
const DASH_PATTERN = /[\u2013\u2014]/g;

// The humanizer skill's overused AI words (its section 12, version 3.1.0) plus the owner's
// always-on list. Left out, because these skills use them in an ordinary or technical sense:
// actually, align with, gate, highlight, key, quietly, robust, valuable, and underscore as the
// name of the character (only its verb forms are listed).
const STOCK_WORD_SOURCES = [
  'additionally',
  'bolster(?:s|ed|ing)?',
  'crucial(?:ly)?',
  'deep[ -]dives?',
  'delv(?:e|es|ed|ing)',
  'enduring',
  'enhanc(?:e|es|ed|ing)',
  'foster(?:s|ed|ing)?',
  'garner(?:s|ed|ing)?',
  'interplay',
  'intricate(?:ly)?',
  'intricac(?:y|ies)',
  'landscapes?',
  'meticulous(?:ly)?',
  'pivotal',
  'showcas(?:e|es|ed|ing)',
  'tapestr(?:y|ies)',
  'testaments?',
  'underscor(?:ed|ing)',
  'vibrant',
];
const STOCK_WORD_PATTERN = new RegExp(`\\b(?:${STOCK_WORD_SOURCES.join('|')})\\b`, 'gi');

const LINE_BREAK = /\r?\n/;
const FENCE = /^\s*(?:```|~~~)/;
const INLINE_CODE = /(`+).*?\1/g;
const EXCERPT_LENGTH = 100;

const blank = (text) => ' '.repeat(text.length);

/**
 * The same text with fenced code blocks and inline code spans turned into spaces, so a word that
 * is quoted as code is not read as prose. Lines and columns stay where they were.
 */
export function blankCode(text) {
  let inFence = false;
  const lines = text.split(LINE_BREAK).map((line) => {
    if (FENCE.test(line)) {
      inFence = !inFence;
      return blank(line);
    }
    return inFence ? blank(line) : line.replace(INLINE_CODE, (span) => blank(span));
  });
  return lines.join('\n');
}

function findInLines(text, pattern, describe) {
  const findings = [];
  text.split(LINE_BREAK).forEach((line, index) => {
    for (const match of line.matchAll(pattern)) {
      findings.push({ line: index + 1, column: match.index + 1, message: describe(match[0]) });
    }
  });
  return findings;
}

/** Em and en dashes anywhere in the text, code included. */
export function findDashes(text) {
  return findInLines(text, DASH_PATTERN, (dash) => DASH_NAMES[dash]);
}

/** Stock AI words outside fenced code blocks and inline code spans. */
export function findStockWords(text) {
  const describe = (word) => `stock AI word "${word.toLowerCase()}"`;
  return findInLines(blankCode(text), STOCK_WORD_PATTERN, describe);
}

/** Dashes and stock AI words, in reading order. */
export function checkProse(text) {
  const byPosition = (a, b) => a.line - b.line || a.column - b.column;
  return [...findDashes(text), ...findStockWords(text)].sort(byPosition);
}

/** One line of the text for a report, with each dash shown as its code point. */
export function excerptOf(text, lineNumber) {
  const line = (text.split(LINE_BREAK)[lineNumber - 1] ?? '').trim();
  const safe = line.replace(DASH_PATTERN, (dash) => DASH_CODES[dash]);
  return safe.length > EXCERPT_LENGTH ? `${safe.slice(0, EXCERPT_LENGTH)}...` : safe;
}

/** Lines in the text; a final line break does not start another line. */
export function countLines(text) {
  if (text === '') return 0;
  return text.replace(/\r?\n$/, '').split(LINE_BREAK).length;
}

/** The problem with a SKILL.md's length, or null when it is within the cap. */
export function checkSkillLength(text) {
  const lines = countLines(text);
  if (lines <= SKILL_LINE_CAP) return null;
  return `${lines} lines, the cap is ${SKILL_LINE_CAP}: move detail to a reference file`;
}
