// Token type definitions for TSClang compiler

export interface Token {
  type: string;
  value: string;
  line: number;
  col: number;
  endCol: number;
}
