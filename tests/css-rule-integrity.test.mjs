import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/**
 * Rule-integrity contract for every shipped stylesheet.
 *
 * Background: while deleting dead selector lists, a sweep once left the `{ … }`
 * declaration body behind without its selector. At the top level of a stylesheet,
 * CSS parsing treats that stray text and its `}` as part of the NEXT rule's
 * prelude (CSS Syntax 3: the malformed rule is dropped), so the browser silently
 * discards a live rule — `.connect-panel`, `.language-select` and
 * `.segmented-control` briefly lost their base styling this way, and neither the
 * test suite nor CI noticed.
 *
 * This guard scans each `extension/*.css` with a comment/string/escape-aware
 * tokenizer that tracks whether it is between rules (selector context) or inside
 * a rule's declaration block, and fails when:
 *   - a `;` or `}` appears inside a selector (always invalid — a tell-tale of an
 *     orphaned declaration body merged into the next rule), or
 *   - a stray `}` appears with no open block (leftover declaration body).
 *
 * Legal constructs that must NOT be flagged:
 *   - `;` terminating an at-rule prelude (`@import url(x);`, `@charset "utf-8";`),
 *   - `;` between declarations inside a block,
 *   - `;`/`}`/`{` inside quoted strings, comments, url(...) tokens,
 *   - nested rules (CSS nesting), @keyframes, @media, @font-face and friends.
 */

const root = path.resolve(import.meta.dirname, '..');
const cssDir = path.join(root, 'extension');

// At-rules whose block body is declarations, not rules.
const DECL_AT_RULES = new Set([
  'font-face', 'page', 'property', 'counter-style', 'viewport',
  'font-feature-values', 'layer', 'position-try',
]);

/** Strip comments so at-rule detection sees the real first token of a prelude. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * Scan a stylesheet; return [{ line, column, reason, snippet }].
 * Frame kinds: "rules" = children are rules (top level, @media, @keyframes, …);
 * "decls" = children are declarations (a qualified rule's block, @font-face, …).
 */
function scanCss(css) {
  const faults = [];
  const stack = ['rules'];
  let i = 0;
  let preludeStart = 0;

  const lineCol = (index) => {
    let line = 1;
    for (let k = 0; k < index; k++) if (css.charCodeAt(k) === 10) line++;
    const lastBreak = css.lastIndexOf('\n', index - 1);
    return { line, column: index - lastBreak };
  };
  const report = (index, reason) => {
    const { line, column } = lineCol(index);
    const snippet = stripComments(css.slice(preludeStart, index)).trim().replace(/\s+/g, ' ').slice(0, 90);
    faults.push({ line, column, reason, snippet });
  };

  while (i < css.length) {
    const c = css[i];

    // Comments: consume fully; never part of a prelude.
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }

    // Strings: consume so braces/semicolons inside them are inert.
    if (c === '"' || c === "'") {
      i++;
      while (i < css.length) {
        if (css[i] === '\\') { i += 2; continue; }
        if (css[i] === c) { i++; break; }
        i++;
      }
      continue;
    }

    // url( … ) token: consume an unquoted payload so data: URIs with `;` are inert.
    if ((c === 'u' || c === 'U') && /^url\(/i.test(css.slice(i, i + 4))) {
      const open = css.indexOf('(', i);
      if (css[open + 1] === '"' || css[open + 1] === "'") { i = open + 1; continue; } // quoted: string branch next
      i = open + 1;
      while (i < css.length && css[i] !== ')') {
        if (css[i] === '\\') { i += 2; continue; }
        i++;
      }
      i++;
      continue;
    }

    if (c === '{') {
      const kind = modeForPrelude(stripComments(css.slice(preludeStart, i)));
      stack.push(kind);
      preludeStart = i + 1;
      i++;
      continue;
    }

    if (c === '}') {
      if (stack.length === 1) {
        report(i, 'stray closing brace `}` with no open block (leftover declaration body?)');
      } else {
        stack.pop();
      }
      preludeStart = i + 1;
      i++;
      continue;
    }

    if (c === ';') {
      const mode = stack[stack.length - 1];
      const prelude = stripComments(css.slice(preludeStart, i)).trim();
      if (mode === 'rules' && !prelude.startsWith('@')) {
        report(i, '`;` inside a selector — orphaned declarations merged into the next rule?');
        preludeStart = i + 1; // recover so the scan keeps going
      } else if (mode === 'rules' && prelude.startsWith('@')) {
        preludeStart = i + 1; // at-rule statement terminator: prelude ends, stay in this frame
      }
      // decls: declaration separator, perfectly normal.
      i++;
      continue;
    }

    i++;
  }
  return faults;

  function modeForPrelude(prelude) {
    const trimmed = prelude.trim();
    if (!trimmed.startsWith('@')) return 'decls'; // qualified rule -> declaration block
    const name = /^@([-a-zA-Z]+)/.exec(trimmed)?.[1]?.toLowerCase() ?? '';
    return DECL_AT_RULES.has(name) ? 'decls' : 'rules';
  }
}

const cssFiles = readdirSync(cssDir).filter((f) => f.endsWith('.css')).sort();

test('every shipped stylesheet parses without orphaned declaration bodies or malformed selectors', () => {
  assert.ok(cssFiles.length > 0, 'expected at least one stylesheet in extension/');
  for (const file of cssFiles) {
    const css = readFileSync(path.join(cssDir, file), 'utf8');
    const faults = scanCss(css);
    const detail = faults
      .map((f) => `  ${file}:${f.line}:${f.column} — ${f.reason}\n    ${f.snippet}`)
      .join('\n');
    assert.equal(faults.length, 0, `CSS rule-integrity faults in ${file}:\n${detail}`);
  }
});

test('guard detects an orphaned declaration body (self-check)', () => {
  const broken = '.live-rule { color: red; }\n\n  border: 1px solid x;\n  color: y;\n}\n.next-rule { color: blue; }\n';
  const faults = scanCss(broken);
  // The orphan body trips both detectors: each `;` lands in the next prelude and
  // the leftover `}` has no block to close.
  assert.ok(faults.some((f) => /stray closing brace/.test(f.reason)), JSON.stringify(faults, null, 1));
  assert.ok(faults.some((f) => /`;` inside a selector/.test(f.reason)), JSON.stringify(faults, null, 1));
});

test('guard detects declarations merged into a selector (self-check)', () => {
  const broken = '.live-rule { color: red; }\n\ncolor: y;\n.next-rule { color: blue; }\n';
  const faults = scanCss(broken);
  assert.equal(faults.length, 1, JSON.stringify(faults, null, 1));
  assert.match(faults[0].reason, /`;` inside a selector/);
});

test('guard tolerates legal semicolons, strings, comments, at-rules and nesting', () => {
  const legal = [
    '@import url(x.css);',
    '@charset "utf-8";',
    '/* comment with ; and } and { inside */',
    '.a[data-x="a;b}c"] { content: "}"; background: url(data:image/png;base64,AAA); }',
    '@media (width > 10px) { .b { color: red; } }',
    '@font-face { font-family: X; src: url(x.woff2); }',
    '@keyframes spin { 0%, 100% { transform: none; } }',
    '.outer { .inner { color: red; } &:hover { color: blue; } }',
  ].join('\n');
  assert.deepEqual(scanCss(legal), []);
});