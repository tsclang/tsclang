// OutputBuffer — encapsulates C output accumulation.
// Extracted from Context to reduce god-object coupling.
//
// Responsibilities:
//   - Hold output sections: includes, typedefs, topLevel, mainStmts, lambdaLines
//   - Route lines via addTop() (smart typedef vs. topLevel dispatch)
//   - addLambda() for hoisted lambda functions
//
// NOT responsible for:
//   - Final assembly (emit() stays on Context — needs too much cross-cutting state)
//   - Indentation (ind() stays on Context)

export class OutputBuffer {
  constructor(initialInclude) {
    this.includes = new Set(initialInclude ? [initialInclude] : []);
    this.typedefs = [];
    this.topLevel = [];
    this.mainStmts = [];
    this.lambdaLines = [];
    this._inTypedefBlock = false;
    this._lastAddedToTypedefs = false;
  }

  // Smart router: typedef/struct declarations → typedefs section.
  // Named function definitions → topLevel section.
  // Companion static const arrays follow their parent typedef.
  addTop(line) {
    // Inside a multi-line typedef/struct block — route continuation lines to typedefs
    if (this._inTypedefBlock) {
      this.typedefs.push(line);
      if (line.startsWith('}')) this._inTypedefBlock = false;
      return;
    }

    if (line.startsWith('typedef ') || line.startsWith('typedef\t') || line.startsWith('struct ')) {
      this.typedefs.push(line);
      this._lastAddedToTypedefs = true;
      // Detect start of multi-line block (no closing } on same line)
      if (!line.includes('}')) this._inTypedefBlock = true;
    } else if (this._lastAddedToTypedefs && (line.startsWith('static const ') || line === '')) {
      // Companion declarations (e.g. enum values/names arrays) follow typedefs directly.
      // Absorb blank lines; add non-blank companion lines to typedefs.
      if (line !== '') this.typedefs.push(line);
      // Keep flag so multiple companions are grouped
    } else {
      this._lastAddedToTypedefs = false;
      this.topLevel.push(line);
    }
  }

  addLambda(line) {
    this.lambdaLines.push(line);
  }
}
