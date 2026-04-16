// TSClang diagnostic / error reporting module.
// Provides TscError (typed error with source position) and renderDiagnostic().

import { isColorEnabled, makeColors } from './colors.js';

// ---------------------------------------------------------------------------
// TscError
// ---------------------------------------------------------------------------
export class TscError extends Error {
  constructor(message, opts = {}) {
    super(message);
    this.name       = 'TscError';
    this.isTscError = true;
    this.filename   = opts.filename ?? '<unknown>';
    this.line       = opts.line    ?? null;   // 1-based
    this.col        = opts.col     ?? null;   // 1-based
    this.endCol     = opts.endCol  ?? null;   // exclusive end col
    this.src        = opts.src     ?? null;   // full source text
    this.label      = opts.label   ?? null;   // text after primary ^ caret
    this.spans      = opts.spans   ?? [];     // secondary spans (see below)
    this.help       = opts.help    ?? [];     // string[] → "= help:" lines
    this.notes      = opts.notes   ?? [];     // string[] → "= note:" lines
    this.code       = opts.code    ?? null;   // 'E001' etc.
    this.kind       = opts.kind    ?? 'error'; // 'error' | 'warning'
  }
}
// Secondary span shape:
// { line: Number, col: Number, endCol?: Number, char?: '-'|'~', label?: String }

// ---------------------------------------------------------------------------
// Tab expansion helpers
// ---------------------------------------------------------------------------
const TAB_WIDTH = 4;

function expandTabs(s) {
  let result = '', vcol = 0;
  for (const ch of s) {
    if (ch === '\t') {
      const n = TAB_WIDTH - (vcol % TAB_WIDTH);
      result += ' '.repeat(n);
      vcol += n;
    } else {
      result += ch;
      vcol++;
    }
  }
  return result;
}

// Visual column of a 1-based source column, accounting for tab expansion.
// Returns the number of display characters before that column.
function visualPosition(rawLine, col1based) {
  const sliceLen = Math.max(0, col1based - 1);
  return expandTabs(rawLine.slice(0, sliceLen)).length;
}

// ---------------------------------------------------------------------------
// renderDiagnostic(diag, opts) → string
//
// opts:
//   color        — override color flag (default: from colors.js _enabled)
//   contextLines — source lines of context around each span (default 1)
// ---------------------------------------------------------------------------
export function renderDiagnostic(diag, opts = {}) {
  const contextLines = opts.contextLines ?? 1;

  // Resolve color: explicit opts.color overrides module-level _enabled
  const colorOn = opts.color !== undefined ? opts.color : isColorEnabled();
  const C = makeColors(colorOn);

  const out = [];

  // ── 1. Header: error[E001]: message  /  warning: message ────────────────
  const kind     = diag.kind ?? 'error';
  const codePart = diag.code ? `[${diag.code}]` : '';
  const headerColor = kind === 'warning' ? C.yellow : C.boldRed;
  const primaryColor = kind === 'warning' ? C.yellow : C.boldRed;
  out.push(`${headerColor(`${kind}${codePart}:`)} ${C.bold(diag.message)}`);

  // ── 2. Location: --> file:line:col ────────────────────────────────────────
  if (diag.line) {
    const loc = diag.col != null
      ? `${diag.filename}:${diag.line}:${diag.col}`
      : `${diag.filename}:${diag.line}`;
    out.push(` ${C.cyan('-->')} ${loc}`);
  }

  // ── 3–4. Source snippet ───────────────────────────────────────────────────
  if (diag.src && diag.line) {
    // Split source into lines. strip \r so rawLine is clean for display.
    const srcLines = diag.src.split('\n').map(l => l.replace(/\r$/, ''));

    // Collect anchor lines (primary + all secondary spans)
    const anchors = new Set([diag.line]);
    for (const sp of diag.spans) {
      if (sp.line != null) anchors.add(sp.line);
    }

    // Expand each anchor ±contextLines, clamp to valid range
    const showSet = new Set();
    for (const anchor of anchors) {
      for (let d = -contextLines; d <= contextLines; d++) {
        const ln = anchor + d;
        if (ln >= 1 && ln <= srcLines.length) showSet.add(ln);
      }
    }
    const showLines = [...showSet].sort((a, b) => a - b);

    // gutterWidth from max line number shown (tip 1: consistent | alignment)
    const maxLine    = showLines[showLines.length - 1] ?? diag.line;
    const gw         = maxLine.toString().length;
    const pad        = ' '.repeat(gw);

    // Gutter helpers
    const lineGutter  = (num)     => C.cyan(String(num).padStart(gw)) + C.cyan(' | ');
    const blankGutter = ()        => C.cyan(pad + '  |');
    const gutterRow = (spaces, marks, labelStr) =>
      C.cyan(pad + '  | ') + spaces + marks + labelStr;

    // Build span index: lineNum → [spanInfo, ...]
    const spansByLine = new Map();
    const addSpan = (line, sp) => {
      if (!spansByLine.has(line)) spansByLine.set(line, []);
      spansByLine.get(line).push(sp);
    };

    // Primary span
    addSpan(diag.line, {
      col:       diag.col    ?? 1,
      endCol:    diag.endCol ?? null,
      char:      '^',
      label:     diag.label  ?? null,
      isPrimary: true,
    });

    // Secondary spans
    for (const sp of diag.spans) {
      if (sp.line == null) continue;
      addSpan(sp.line, {
        col:       sp.col    ?? 1,
        endCol:    sp.endCol ?? null,
        char:      sp.char   ?? '-',
        label:     sp.label  ?? null,
        isPrimary: false,
      });
    }

    // Opening blank gutter
    out.push(blankGutter());

    let prevLn = null;
    for (const ln of showLines) {
      // Gap marker — only when lines are not consecutive (tip from plan)
      if (prevLn !== null && ln > prevLn + 1) {
        out.push(C.cyan(pad + '  | ') + C.dim('...'));
      }

      // Source line — already stripped of \r; remove any stray \n too (tip 3)
      const rawLine  = srcLines[ln - 1] ?? '';
      const expanded = expandTabs(rawLine);
      out.push(lineGutter(ln) + expanded);

      // Underline rows for this line
      const lineSpans = spansByLine.get(ln);
      if (lineSpans) {
        // Sort: primary first, then by col
        const sorted = [...lineSpans].sort((a, b) =>
          (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) ||
          (a.col ?? 1) - (b.col ?? 1)
        );

        // Compute visual extents for each span
        const computed = sorted.map(sp => {
          const vStart = visualPosition(rawLine, sp.col ?? 1);
          const vEnd   = sp.endCol != null
            ? visualPosition(rawLine, sp.endCol)
            : vStart + 1;
          return { ...sp, vStart, vEnd, spanLen: Math.max(1, vEnd - vStart) };
        });

        if (computed.length === 1) {
          // Single span: underline + inline label on same row
          const { vStart, spanLen, isPrimary, char, label } = computed[0];
          const colorFn   = isPrimary ? primaryColor : C.yellow;
          const underline = colorFn(char.repeat(spanLen));
          const labelStr  = label ? colorFn(' ' + label) : '';
          out.push(gutterRow(' '.repeat(vStart), underline, labelStr));
        } else {
          // Multiple spans: merge all underlines onto one row, labels on rows below
          let pos = 0, mergedRow = '';
          for (const { vStart, spanLen, isPrimary, char } of computed) {
            if (vStart > pos) mergedRow += ' '.repeat(vStart - pos);
            const colorFn = isPrimary ? primaryColor : C.yellow;
            mergedRow += colorFn(char.repeat(spanLen));
            pos = vStart + spanLen;
          }
          out.push(gutterRow('', mergedRow, ''));
          // Labels: each on its own row, right-aligned to span start
          for (const { vStart, spanLen, isPrimary, label } of computed) {
            if (!label) continue;
            const colorFn = isPrimary ? primaryColor : C.yellow;
            // Place label after the underline end, or just after start if it would overlap
            const labelPos = vStart + spanLen + 1;
            out.push(gutterRow(' '.repeat(labelPos), colorFn(label), ''));
          }
        }
      }

      prevLn = ln;
    }

    // Closing blank gutter
    out.push(blankGutter());
  }

  // ── 5. help lines ─────────────────────────────────────────────────────────
  for (const h of diag.help) {
    out.push(`  ${C.green('= help:')} ${h}`);
  }

  // ── 6. note lines ─────────────────────────────────────────────────────────
  for (const n of diag.notes) {
    out.push(`  ${C.cyan('= note:')} ${n}`);
  }

  return out.join('\n');
}
