import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SKILL_LINE_CAP,
  blankCode,
  checkProse,
  checkSkillLength,
  countLines,
  excerptOf,
  findDashes,
  findStockWords,
} from './rules.mjs';

// Written as code points, never as the characters themselves.
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);

const linesOf = (count) => `${Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n')}\n`;

describe('findDashes', () => {
  it('finds an em dash with its line and column', () => {
    assert.deepEqual(findDashes(`first\nwake design ${EM} usage`), [
      { line: 2, column: 13, message: 'em dash (U+2014)' },
    ]);
  });

  it('finds an en dash', () => {
    assert.deepEqual(findDashes(`pages 3${EN}5`), [
      { line: 1, column: 8, message: 'en dash (U+2013)' },
    ]);
  });

  it('finds every dash on a line', () => {
    assert.equal(findDashes(`a ${EM} b ${EM} c`).length, 2);
  });

  it('finds a dash inside code too', () => {
    assert.equal(findDashes(`\`a ${EM} b\`\n\`\`\`\nx ${EN} y\n\`\`\``).length, 2);
  });

  it('leaves hyphens and double hyphens alone', () => {
    assert.deepEqual(findDashes('a well-known --flag - and -- this'), []);
  });

  it('counts lines across CRLF line breaks', () => {
    assert.equal(findDashes(`one\r\ntwo ${EM}`)[0].line, 2);
  });
});

describe('findStockWords', () => {
  it('finds a stock word with its line and column', () => {
    assert.deepEqual(findStockWords('ok\nthis is a pivotal step'), [
      { line: 2, column: 11, message: 'stock AI word "pivotal"' },
    ]);
  });

  it('ignores letter case and reports the word in lowercase', () => {
    assert.equal(findStockWords('Additionally, it runs.')[0].message, 'stock AI word "additionally"');
  });

  for (const word of ['delves', 'showcasing', 'fostered', 'deep dive', 'deep-dives', 'intricacies',
    'underscoring', 'landscapes', 'enhanced', 'testament', 'vibrant', 'crucially', 'meticulously',
    'garnered', 'bolsters', 'tapestry', 'interplay', 'enduring', 'intricately']) {
    it(`finds the form "${word}"`, () => {
      assert.equal(findStockWords(`it ${word} here`).length, 1);
    });
  }

  for (const word of ['enhancement', 'underscore', 'underscores', 'key', 'gate', 'robust',
    'actually', 'highlight', 'fosterage', 'predelve']) {
    it(`leaves "${word}" alone`, () => {
      assert.deepEqual(findStockWords(`the ${word} here`), []);
    });
  }

  it('leaves a word in an inline code span alone', () => {
    assert.deepEqual(findStockWords('never write `delve` or ``pivotal`` in a skill'), []);
  });

  it('finds a word after an inline code span on the same line', () => {
    assert.deepEqual(findStockWords('run `x` in a vibrant way'), [
      { line: 1, column: 14, message: 'stock AI word "vibrant"' },
    ]);
  });

  it('leaves a word in a fenced code block alone', () => {
    assert.deepEqual(findStockWords('text\n```\na pivotal line\n```\n~~~\ndelve\n~~~'), []);
  });

  it('finds a word after a fenced code block has closed', () => {
    assert.deepEqual(findStockWords('```\ncode\n```\na pivotal line'), [
      { line: 4, column: 3, message: 'stock AI word "pivotal"' },
    ]);
  });
});

describe('blankCode', () => {
  it('keeps every line and column in place', () => {
    const text = 'a `b` c\n```js\ncode\n```\nend';
    const blanked = blankCode(text);
    assert.equal(blanked.length, text.length);
    assert.equal(blanked, 'a     c\n     \n    \n   \nend');
  });
});

describe('checkProse', () => {
  it('returns dashes and stock words in reading order', () => {
    const findings = checkProse(`a pivotal ${EM} step\nand ${EN} it delves`);
    assert.deepEqual(findings.map((finding) => `${finding.line}:${finding.column}`), [
      '1:3', '1:11', '2:5', '2:10',
    ]);
  });

  it('returns nothing for clean text', () => {
    assert.deepEqual(checkProse('Plain text, with a hyphen-ated word.\n'), []);
  });
});

describe('excerptOf', () => {
  it('shows the line with each dash as its code point', () => {
    assert.equal(excerptOf(`one\n  two ${EM} three ${EN} four  `, 2), 'two <U+2014> three <U+2013> four');
  });

  it('cuts a long line', () => {
    const excerpt = excerptOf('x'.repeat(300), 1);
    assert.equal(excerpt, `${'x'.repeat(100)}...`);
  });

  it('is empty for a line the text does not have', () => {
    assert.equal(excerptOf('one', 5), '');
  });
});

describe('countLines', () => {
  it('does not count a final line break as a line', () => {
    assert.equal(countLines('a\nb\n'), 2);
    assert.equal(countLines('a\nb'), 2);
    assert.equal(countLines('a\r\nb\r\n'), 2);
  });

  it('counts an empty text as zero lines', () => {
    assert.equal(countLines(''), 0);
  });
});

describe('checkSkillLength', () => {
  it('accepts a file at the cap', () => {
    assert.equal(checkSkillLength(linesOf(SKILL_LINE_CAP)), null);
  });

  it('refuses a file one line over the cap', () => {
    assert.equal(
      checkSkillLength(linesOf(SKILL_LINE_CAP + 1)),
      '121 lines, the cap is 120: move detail to a reference file',
    );
  });
});
