// Token type definitions for TSClang compiler

export interface Token {
  type: string;
  value: string;
  line: number;
  col: number;
  endCol: number;
  parts?: unknown[];
  // Verbatim source text of a string literal (between the quotes). `value`
  // holds the JS-decoded form; `raw` is kept for verbatim C embedding
  // (native blocks). See lexer.ts for details.
  raw?: string;
}
