// TSClang Lexer
// Converts source text into a flat token array.

export const TK = {
  // Literals
  NUMBER: 'NUMBER',       // 42, 3.14
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

  // Operators
  PLUS:  '+',  MINUS:  '-',  STAR:  '*',  SLASH: '/',  PERCENT: '%',
  EQ:    '=',  EQEQ:   '==', BANGEQ: '!=',
  EQEQEQ:'===', BANGEQEQ:'!==',
  LT:    '<',  GT:     '>',  LTE:   '<=', GTE:   '>=',
  BANG:  '!',  AMP2:   '&&', PIPE2: '||', QUEST2: '??',
  PLUS2: '++', MINUS2: '--',
  PLUSEQ: '+=', MINUSEQ: '-=', STAREQ: '*=', SLASHEQ: '/=',
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

export class Token {
  constructor(type, value, line, col) {
    this.type  = type;
    this.value = value;
    this.line  = line;
    this.col   = col;
  }
  toString() { return `Token(${this.type}, ${JSON.stringify(this.value)}, ${this.line}:${this.col})`; }
}

export function lex(src, filename = '<input>') {
  const tokens = [];
  let i = 0, line = 1, col = 1;

  function cur()  { return src[i]; }
  function peek(n = 1) { return src[i + n]; }
  function advance() {
    const ch = src[i++];
    if (ch === '\n') { line++; col = 1; } else { col++; }
    return ch;
  }
  function addTok(type, value) { tokens.push(new Token(type, value, line, col)); }
  function err(msg) { throw new Error(`${filename}:${line}:${col}: ${msg}`); }

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

    // String literal (single or double quote, template literal)
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = advance();
      let str = '';
      while (i < src.length && cur() !== quote) {
        if (cur() === '\\') { advance(); str += '\\' + advance(); }
        else str += advance();
      }
      if (i >= src.length) err('Unterminated string');
      advance(); // closing quote
      tokens.push(new Token(TK.STRING, str, startLine, startCol));
      continue;
    }

    // Number
    if (ch >= '0' && ch <= '9') {
      let num = '';
      if (ch === '0' && (peek() === 'x' || peek() === 'X')) {
        num += advance() + advance(); // 0x
        while (i < src.length && /[0-9a-fA-F_]/.test(cur())) num += advance();
      } else if (ch === '0' && (peek() === 'b' || peek() === 'B')) {
        num += advance() + advance(); // 0b
        while (i < src.length && /[01_]/.test(cur())) num += advance();
      } else if (ch === '0' && (peek() === 'o' || peek() === 'O')) {
        num += advance() + advance(); // 0o
        while (i < src.length && /[0-7_]/.test(cur())) num += advance();
      } else {
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
      }
      tokens.push(new Token(TK.NUMBER, num.replace(/_/g, ''), startLine, startCol));
      continue;
    }

    // Identifier / keyword
    if (ch === '_' || ch === '$' || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
      let id = '';
      while (i < src.length && /[\w$]/.test(cur())) id += advance();
      if (id === 'true' || id === 'false') {
        tokens.push(new Token(TK.BOOL, id, startLine, startCol));
      } else if (id === 'null') {
        tokens.push(new Token(TK.NULL, id, startLine, startCol));
      } else {
        tokens.push(new Token(TK.IDENT, id, startLine, startCol));
      }
      continue;
    }

    // Multi-char operators
    advance(); // consume ch
    const rest = ch + (src[i] ?? '') + (src[i+1] ?? '') + (src[i+2] ?? '');

    if (rest.startsWith('...')) { i += 2; col += 2; tokens.push(new Token(TK.SPREAD,    '...',  startLine, startCol)); continue; }
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
    if (rest.startsWith('**=')) { i += 2; col += 2; tokens.push(new Token(TK.STAREQ,   '**=',  startLine, startCol)); continue; }
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
    if (singleMap[ch]) { tokens.push(new Token(singleMap[ch], ch, startLine, startCol)); continue; }

    err(`Unexpected character: ${JSON.stringify(ch)}`);
  }

  tokens.push(new Token(TK.EOF, '', line, col));
  return tokens;
}
