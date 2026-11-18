// TSClang Lexer
// Converts source text into a flat token array.

import type { NativeTemplatePart } from '@tsclang/ast';

export const TK = {
  // Literals
  NUMBER: 'NUMBER',       // 42, 3.14
  BIGINT: 'BIGINT',       // 42n (integer, any radix base)
  STRING: 'STRING',       // "hello"
  BOOL:   'BOOL',         // true / false
  NULL:   'NULL',         // null
  IDENT:  'IDENT',        // identifiers and keywords

  // Punctuation
  LPAREN: '(',  RPAREN: ')',
  LBRACE: '{',  RBRACE: '}',
  LBRACK: '[',  RBRACK: ']',
  SEMI:   ';',  COLON:  ':',
  COMMA:  ',',  DOT:    '.',
  ARROW:  '=>',
  SPREAD: '...',
  DOTDOT: '..',
  SQUOTE: 'SQUOTE',
  TEMPLATE: 'TEMPLATE',

  // Operators
  PLUS:  '+',  MINUS:  '-',  STAR:  '*',  SLASH: '/',  PERCENT: '%',
  EQ:    '=',  EQEQ:   '==', BANGEQ: '!=',
  EQEQEQ:'===', BANGEQEQ:'!==',
  LT:    '<',  GT:     '>',  LTE:   '<=', GTE:   '>=',
  BANG:  '!',  AMP2:   '&&', PIPE2: '||', QUEST2: '??',
  PLUS2: '++', MINUS2: '--',
  PLUSEQ: '+=', MINUSEQ: '-=', STAREQ: '*=', STARSTAREQ: '**=', SLASHEQ: '/=',
  AMPEQ: '&=',  PIPEEQ: '|=',  PERCENTEQ: '%=', CARETEQ: '^=',
  LSHIFTEQ: '<<=', RSHIFTEQ: '>>=', RSHIFTUEQ: '>>>=',
  AMP2EQ: '&&=', PIPE2EQ: '||=', QUEST2EQ: '??=',
  QUESTDOT: '?.',
  STARSTAR: '**',
  AMP:   '&',  PIPE:   '|',  CARET: '^',  TILDE: '~',
  LSHIFT:'<<', RSHIFT: '>>', RSHIFTU: '>>>',
  QUEST: '?',
  HASH:  '#',
  AT:    '@',

  EOF: 'EOF',
};

// Keywords that remain as IDENT type but are flagged
export const KEYWORDS = new Set([
  'let', 'const', 'var', 'function', 'return', 'if', 'else',
  'for', 'while', 'do', 'break', 'continue',
  'class', 'extends', 'new', 'this', 'super',
  'import', 'export', 'from', 'as', 'default',
  'typeof', 'instanceof', 'in', 'of',
  'async', 'await', 'yield',
  'throw', 'try', 'catch', 'finally',
  'switch', 'case',
  'type', 'interface', 'enum', 'declare', 'abstract',
  'public', 'private', 'protected', 'static', 'readonly',
  'void', 'never', 'any', 'unknown',
  'true', 'false', 'null', 'undefined',
  'match', 'spawn', 'drop', 'native', 'unsafe',
]);

// Identifier charset (UAX #31 subset, matches JS/TS ID_Start/ID_Continue for
// practical cases): any unicode letter may start an identifier; letters,
// digits and combining marks may continue. Emoji/currency/symbols are NOT
// identifiers — same as ECMAScript.
const ID_START = /[\p{L}_$]/u;
const ID_CONT  = /[\p{L}\p{N}\p{M}_$]/u;

export class Token {
  type: string;
  value: string;
  line: number;
  col: number;
  endCol: number;
  parts?: NativeTemplatePart[];
  // Verbatim source text of a string literal (between the quotes). `value`
  // holds the JS-decoded form used by the language; `raw` is kept for
  // constructs that embed C source verbatim (native blocks), where escape
  // sequences belong to the C compiler, not to TSClang.
  raw?: string;

  constructor(type: string, value: string, line: number, col: number) {
    this.type   = type;
    this.value  = value;
    this.line   = line;
    this.col    = col;
    this.endCol = col + (value ? value.length : 0);
  }
  toString(): string { return `Token(${this.type}, ${JSON.stringify(this.value)}, ${this.line}:${this.col})`; }
}

export function lex(src: string, filename: string = '<input>'): Token[] {
  const tokens: Token[] = [];
  let i = 0, line = 1, col = 1;

  function cur(): string  { return src[i]; }
  function peek(n: number = 1): string { return src[i + n]; }
  // Current character as a full codepoint (surrogate pairs kept together),
  // so astral letters (e.g. U+1D4B3) test correctly against \p{L}.
  function curCp(): string {
    const c = src[i];
    if (c >= '\ud800' && c <= '\udbff') {
      const lo = src[i + 1];
      if (lo >= '\udc00' && lo <= '\udfff') return c + lo;
    }
    return c;
  }
  function advance(): string {
    const ch = src[i++];
    if (ch === '\n') { line++; col = 1; } else { col++; }
    return ch;
  }
  function addTok(type: string, value: string): void { tokens.push(new Token(type, value, line, col)); }
  function err(msg: string): never { throw new Error(`${filename}:${line}:${col}: ${msg}`); }

  const HEX = /[0-9a-fA-F]/;
  // Read exactly n hex digits and return their value (errors on a shortfall).
  function hexDigits(n: number, msg: string): number {
    let v = 0;
    for (let k = 0; k < n; k++) {
      const c = cur();
      if (c === undefined || !HEX.test(c)) err(msg);
      v = v * 16 + parseInt(advance(), 16);
    }
    return v;
  }

  // Decode one JS escape sequence. `i` points at the character after the
  // backslash. Returns the decoded text ('' for a line continuation).
  // TS/JS semantics: unknown escapes drop the backslash ("\q" === "q"),
  // octal escapes are rejected, \uXXXX surrogate pairs combine into one
  // codepoint. Lone surrogates are rejected: the runtime string model is
  // UTF-8 bytes and cannot represent them.
  function decodeEscape(): string {
    const ec = advance();
    switch (ec) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'v': return '\v';
      case '0':
        if (cur() >= '0' && cur() <= '9') err('Octal escape sequences are not allowed');
        return '\0';
      case 'x': {
        if (cur() === undefined || !HEX.test(cur())) err('Invalid hexadecimal escape sequence');
        return String.fromCharCode(hexDigits(2, 'Invalid hexadecimal escape sequence'));
      }
      case 'u': {
        if (cur() === '{') {
          advance();
          let v = 0, n = 0;
          while (cur() !== '}') {
            const c = cur();
            if (c === undefined) err('Invalid Unicode escape sequence');
            if (!HEX.test(c)) err('Invalid Unicode escape sequence');
            if (n === 6) err('Unicode codepoint out of range');
            v = v * 16 + parseInt(advance(), 16);
            n++;
          }
          advance(); // }
          if (n === 0) err('Invalid Unicode escape sequence');
          if (v > 0x10ffff) err('Unicode codepoint out of range');
          if (v >= 0xd800 && v <= 0xdfff) err('Lone surrogate escape is not allowed');
          return String.fromCodePoint(v);
        }
        if (cur() === undefined || !HEX.test(cur())) err('Invalid Unicode escape sequence');
        const first = hexDigits(4, 'Invalid Unicode escape sequence');
        if (first >= 0xd800 && first <= 0xdbff) {
          // High surrogate: combine with a following \uDCxx low surrogate.
          if (cur() === '\\' && peek() === 'u') {
            const saveI = i, saveLine = line, saveCol = col;
            advance(); advance(); // \ u
            if (cur() !== undefined && HEX.test(cur())) {
              const second = hexDigits(4, 'Invalid Unicode escape sequence');
              if (second >= 0xdc00 && second <= 0xdfff) {
                return String.fromCodePoint(0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00));
              }
              err('Lone surrogate escape is not allowed');
            }
            i = saveI; line = saveLine; col = saveCol; // let the next pass report it
          }
          err('Lone surrogate escape is not allowed');
        }
        if (first >= 0xdc00 && first <= 0xdfff) err('Lone surrogate escape is not allowed');
        return String.fromCharCode(first);
      }
      case '\n': return ''; // line continuation
      case '\r':
        if (cur() === '\n') advance();
        return ''; // \r\n line continuation
      case undefined: err('Unterminated string');
      default:
        if (ec >= '1' && ec <= '9') err('Octal escape sequences are not allowed');
        return ec; // unknown escape: the backslash is dropped, as in JS
    }
  }

  while (i < src.length) {
    const startLine = line, startCol = col;
    const ch = cur();

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') { advance(); continue; }

    // Line comment
    if (ch === '/' && peek() === '/') {
      while (i < src.length && cur() !== '\n') advance();
      continue;
    }

    // Block comment
    if (ch === '/' && peek() === '*') {
      advance(); advance();
      while (i < src.length && !(cur() === '*' && peek() === '/')) advance();
      if (i < src.length) { advance(); advance(); }
      continue;
    }

    // Template literal (backtick)
    if (ch === '`') {
      advance(); // consume `
      const parts: NativeTemplatePart[] = [];
      let str = ''; // decoded text
      let raw = ''; // verbatim text: native blocks embed C source where
      // escape sequences belong to the C compiler (e.g. printf "\n")
      while (i < src.length && cur() !== '`') {
        if (cur() === '\\') {
          const escStart = i;
          advance();
          str += decodeEscape();
          raw += src.slice(escStart, i);
        }
        else if (cur() === '$' && peek() === '{') {
          parts.push({ kind: 'str', value: str, raw }); str = ''; raw = '';
          advance(); advance(); // skip ${
          let depth = 1, exprSrc = '';
          while (i < src.length && depth > 0) {
            if (cur() === '{') depth++;
            else if (cur() === '}') { depth--; if (depth === 0) break; }
            const ec = cur(); if (ec === '\n') line++; i++; col++; exprSrc += ec;
          }
          if (i >= src.length) err('Unterminated template expression');
          advance(); // consume }
          parts.push({ kind: 'expr', src: exprSrc });
        } else { const c = advance(); str += c; raw += c; }
      }
      if (i >= src.length) err('Unterminated template literal');
      advance(); // consume closing `
      parts.push({ kind: 'str', value: str, raw });
      const tmplTok = new Token(TK.TEMPLATE, '', startLine, startCol);
      tmplTok.parts = parts;
      tokens.push(tmplTok);
      continue;
    }

    // String literal (double or single quote)
    if (ch === '"' || ch === "'") {
      const quote = advance();
      let str = '';
      let raw = '';
      while (i < src.length && cur() !== quote) {
        if (cur() === '\\') {
          const escStart = i;
          advance();
          str += decodeEscape();
          raw += src.slice(escStart, i);
        } else { const c = advance(); str += c; raw += c; }
      }
      if (i >= src.length) err('Unterminated string');
      advance(); // closing quote
      // Single-quoted strings are char literals
      if (quote === "'") {
        const tok = new Token(TK.SQUOTE, str, startLine, startCol);
        tok.raw = raw;
        tokens.push(tok);
      } else {
        const tok = new Token(TK.STRING, str, startLine, startCol);
        tok.raw = raw;
        tokens.push(tok);
      }
      continue;
    }

    // Number
    if (ch >= '0' && ch <= '9') {
      let num = '';
      let isBig = false;
      if (ch === '0' && (peek() === 'x' || peek() === 'X')) {
        num += advance() + advance(); // 0x
        while (i < src.length && /[0-9a-fA-F_]/.test(cur())) num += advance();
        if (cur() === 'n') { isBig = true; advance(); }
      } else if (ch === '0' && (peek() === 'b' || peek() === 'B')) {
        num += advance() + advance(); // 0b
        while (i < src.length && /[01_]/.test(cur())) num += advance();
        if (cur() === 'n') { isBig = true; advance(); }
      } else if (ch === '0' && (peek() === 'o' || peek() === 'O')) {
        num += advance() + advance(); // 0o
        while (i < src.length && /[0-7_]/.test(cur())) num += advance();
        if (cur() === 'n') { isBig = true; advance(); }
      } else {
        if (ch === '0' && peek() >= '0' && peek() <= '9') {
          throw new Error(`${filename}:${startLine}:${startCol}: legacy octal notation is not supported; use 0o prefix`);
        }
        while (i < src.length && (cur() >= '0' && cur() <= '9' || cur() === '_')) num += advance();
        if (i < src.length && cur() === '.' && peek() >= '0' && peek() <= '9') {
          num += advance();
          while (i < src.length && cur() >= '0' && cur() <= '9') num += advance();
        }
        if (i < src.length && (cur() === 'e' || cur() === 'E')) {
          num += advance();
          if (cur() === '+' || cur() === '-') num += advance();
          while (i < src.length && cur() >= '0' && cur() <= '9') num += advance();
        }
        // Trailing 'n' is only valid on plain integer forms (JS/TS rule)
        if (i < src.length && cur() === 'n') {
          if (/[.eE]/.test(num)) {
            throw new Error(`${filename}:${startLine}:${startCol}: bigint literal must be an integer (no fraction or exponent)`);
          }
          isBig = true;
          advance();
        }
      }
      tokens.push(new Token(isBig ? TK.BIGINT : TK.NUMBER, num.replace(/_/g, ''), startLine, startCol));
      continue;
    }

    // Identifier / keyword (ASCII fast path, unicode letters via UAX #31 subset)
    const cp = curCp();
    const asciiStart = ch === '_' || ch === '$' || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
    if (asciiStart || (ch.charCodeAt(0) > 0x7f && ID_START.test(cp))) {
      let id = '';
      while (i < src.length) {
        const c = cur();
        const asciiCont = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
          || (c >= '0' && c <= '9') || c === '_' || c === '$';
        if (asciiCont) { id += advance(); continue; }
        const c2 = curCp();
        if (!ID_CONT.test(c2)) break;
        id += c2;
        advance();
        if (c2.length === 2) advance();
      }
      if (id === 'true' || id === 'false') {
        tokens.push(new Token(TK.BOOL, id, startLine, startCol));
      } else if (id === 'null' || id === 'undefined') {
        tokens.push(new Token(TK.NULL, 'null', startLine, startCol));
      } else {
        tokens.push(new Token(TK.IDENT, id, startLine, startCol));
      }
      continue;
    }

    // Multi-char operators
    advance(); // consume ch
    const rest = ch + (src[i] ?? '') + (src[i+1] ?? '') + (src[i+2] ?? '');

    if (rest.startsWith('...')) { i += 2; col += 2; tokens.push(new Token(TK.SPREAD,    '...',  startLine, startCol)); continue; }
    if (rest.startsWith('..') && ch === '.') { i += 1; col += 1; tokens.push(new Token(TK.DOTDOT, '..', startLine, startCol)); continue; }
    if (rest.startsWith('=>'))  { i += 1; col += 1; tokens.push(new Token(TK.ARROW,    '=>',   startLine, startCol)); continue; }
    if (rest.startsWith('===')) { i += 2; col += 2; tokens.push(new Token(TK.EQEQEQ,   '===',  startLine, startCol)); continue; }
    if (rest.startsWith('!==')) { i += 2; col += 2; tokens.push(new Token(TK.BANGEQEQ, '!==',  startLine, startCol)); continue; }
    if (rest.startsWith('=='))  { i += 1; col += 1; tokens.push(new Token(TK.EQEQ,     '==',   startLine, startCol)); continue; }
    if (rest.startsWith('!='))  { i += 1; col += 1; tokens.push(new Token(TK.BANGEQ,   '!=',   startLine, startCol)); continue; }
    if (rest.startsWith('<='))  { i += 1; col += 1; tokens.push(new Token(TK.LTE,      '<=',   startLine, startCol)); continue; }
    if (rest.startsWith('>='))  { i += 1; col += 1; tokens.push(new Token(TK.GTE,      '>=',   startLine, startCol)); continue; }
    if (rest.startsWith('<<=')) { i += 2; col += 2; tokens.push(new Token(TK.LSHIFTEQ, '<<=',  startLine, startCol)); continue; }
    if (rest.startsWith('<<'))  { i += 1; col += 1; tokens.push(new Token(TK.LSHIFT,   '<<',   startLine, startCol)); continue; }
    if (rest.startsWith('>>>=')){ i += 3; col += 3; tokens.push(new Token(TK.RSHIFTUEQ,'>>>=', startLine, startCol)); continue; }
    if (rest.startsWith('>>>')) { i += 2; col += 2; tokens.push(new Token(TK.RSHIFTU,  '>>>',  startLine, startCol)); continue; }
    if (rest.startsWith('>>=')) { i += 2; col += 2; tokens.push(new Token(TK.RSHIFTEQ, '>>=',  startLine, startCol)); continue; }
    if (rest.startsWith('>>'))  { i += 1; col += 1; tokens.push(new Token(TK.RSHIFT,   '>>',   startLine, startCol)); continue; }
    if (rest.startsWith('&&=')) { i += 2; col += 2; tokens.push(new Token(TK.AMP2EQ,   '&&=',  startLine, startCol)); continue; }
    if (rest.startsWith('&&'))  { i += 1; col += 1; tokens.push(new Token(TK.AMP2,     '&&',   startLine, startCol)); continue; }
    if (rest.startsWith('||=')) { i += 2; col += 2; tokens.push(new Token(TK.PIPE2EQ,  '||=',  startLine, startCol)); continue; }
    if (rest.startsWith('||'))  { i += 1; col += 1; tokens.push(new Token(TK.PIPE2,    '||',   startLine, startCol)); continue; }
    if (rest.startsWith('??=')) { i += 2; col += 2; tokens.push(new Token(TK.QUEST2EQ, '??=',  startLine, startCol)); continue; }
    if (rest.startsWith('??'))  { i += 1; col += 1; tokens.push(new Token(TK.QUEST2,   '??',   startLine, startCol)); continue; }
    if (rest.startsWith('?.'))  { i += 1; col += 1; tokens.push(new Token(TK.QUESTDOT, '?.',   startLine, startCol)); continue; }
    if (rest.startsWith('++'))  { i += 1; col += 1; tokens.push(new Token(TK.PLUS2,    '++',   startLine, startCol)); continue; }
    if (rest.startsWith('--'))  { i += 1; col += 1; tokens.push(new Token(TK.MINUS2,   '--',   startLine, startCol)); continue; }
    if (rest.startsWith('+='))  { i += 1; col += 1; tokens.push(new Token(TK.PLUSEQ,   '+=',   startLine, startCol)); continue; }
    if (rest.startsWith('-='))  { i += 1; col += 1; tokens.push(new Token(TK.MINUSEQ,  '-=',   startLine, startCol)); continue; }
    if (rest.startsWith('**=')) { i += 2; col += 2; tokens.push(new Token(TK.STARSTAREQ,'**=',  startLine, startCol)); continue; }
    if (rest.startsWith('**'))  { i += 1; col += 1; tokens.push(new Token(TK.STARSTAR,  '**',   startLine, startCol)); continue; }
    if (rest.startsWith('*='))  { i += 1; col += 1; tokens.push(new Token(TK.STAREQ,   '*=',   startLine, startCol)); continue; }
    if (rest.startsWith('/='))  { i += 1; col += 1; tokens.push(new Token(TK.SLASHEQ,  '/=',   startLine, startCol)); continue; }
    if (rest.startsWith('%='))  { i += 1; col += 1; tokens.push(new Token(TK.PERCENTEQ,'%=',   startLine, startCol)); continue; }
    if (rest.startsWith('&='))  { i += 1; col += 1; tokens.push(new Token(TK.AMPEQ,    '&=',   startLine, startCol)); continue; }
    if (rest.startsWith('|='))  { i += 1; col += 1; tokens.push(new Token(TK.PIPEEQ,   '|=',   startLine, startCol)); continue; }
    if (rest.startsWith('^='))  { i += 1; col += 1; tokens.push(new Token(TK.CARETEQ,  '^=',   startLine, startCol)); continue; }

    // Single char
    const singleMap = {
      '(': TK.LPAREN, ')': TK.RPAREN,
      '{': TK.LBRACE, '}': TK.RBRACE,
      '[': TK.LBRACK, ']': TK.RBRACK,
      ';': TK.SEMI,   ':': TK.COLON,
      ',': TK.COMMA,  '.': TK.DOT,
      '+': TK.PLUS,   '-': TK.MINUS,
      '*': TK.STAR,   '/': TK.SLASH,
      '%': TK.PERCENT,'=': TK.EQ,
      '<': TK.LT,     '>': TK.GT,
      '!': TK.BANG,   '&': TK.AMP,
      '|': TK.PIPE,   '^': TK.CARET,
      '~': TK.TILDE,  '?': TK.QUEST,
      '#': TK.HASH,   '@': TK.AT,
    };
    if ((singleMap as Record<string,string>)[ch]) { tokens.push(new Token((singleMap as Record<string,string>)[ch], ch, startLine, startCol)); continue; }

    err(`Unexpected character: ${JSON.stringify(ch)}`);
  }

  tokens.push(new Token(TK.EOF, '', line, col));
  return tokens;
}
