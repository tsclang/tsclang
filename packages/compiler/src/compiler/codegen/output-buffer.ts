// OutputBuffer — encapsulates C output accumulation.
// Extracted from Context to reduce god-object coupling.

export class OutputBuffer {
  includes: Set<string>;
  typedefs: string[];
  topLevel: string[];
  mainStmts: string[];
  lambdaLines: string[];
  // Emitted after topLevel (after all user functions): bodies of helpers that
  // call user functions by name (plain-fn env adapters)
  lateLines: string[];
  _inTypedefBlock: boolean;
  _lastAddedToTypedefs: boolean;

  constructor(initialInclude?: string) {
    this.includes = new Set(initialInclude ? [initialInclude] : []);
    this.typedefs = [];
    this.topLevel = [];
    this.mainStmts = [];
    this.lambdaLines = [];
    this.lateLines = [];
    this._inTypedefBlock = false;
    this._lastAddedToTypedefs = false;
  }

  addTop(line: string): void {
    if (this._inTypedefBlock) {
      this.typedefs.push(line);
      if (line.startsWith('}')) this._inTypedefBlock = false;
      return;
    }

    if (line.startsWith('typedef ') || line.startsWith('typedef\t') || line.startsWith('struct ')) {
      this.typedefs.push(line);
      this._lastAddedToTypedefs = true;
      if (!line.includes('}')) this._inTypedefBlock = true;
    } else if (this._lastAddedToTypedefs && (line.startsWith('static const ') || line === '')) {
      if (line !== '') this.typedefs.push(line);
    } else {
      this._lastAddedToTypedefs = false;
      this.topLevel.push(line);
    }
  }

  addLambda(line: string): void {
    this.lambdaLines.push(line);
  }

  addLate(line: string): void {
    this.lateLines.push(line);
  }
}
