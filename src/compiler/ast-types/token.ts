// Token type definitions for TSClang compiler
// Stage 2 of JS→TS migration (#84)

export interface Token {
  type: string;
  value: string;
  line: number;
  col: number;
  endCol: number;
}
