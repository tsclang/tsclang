/**
 * @fileoverview IR (Intermediate Representation) data structures.
 *
 * SSA-like high-level IR between AST and C. Based on basic blocks.
 * Spec: spec/16-tooling/16-compiler.md — IR section.
 *
 * Hierarchy:
 *   IRModule → IRFunction[] → IRBasicBlock[] → IRInstruction[]
 *
 * Each IRBasicBlock has a linear sequence of instructions + exactly one terminator.
 * Terminators: return, branch, jump, throw, await.
 */

/**
 * @typedef {string | number | boolean | null} IRValue
 * SSA value name (string), literal (number/boolean), or null.
 */

const TERMINATORS = new Set(['return', 'branch', 'jump', 'throw', 'await']);

/**
 * IRInstruction — single SSA-like instruction.
 *
 * Create via factory methods (IRInstruction.alloc, IRInstruction.call, etc.)
 * rather than raw constructor for clarity and validation.
 */
export class IRInstruction {
  /**
   * @param {string} op — one of: alloc, borrow, retain, release, call,
   *   assign, drop, return, branch, jump, phi, await, yield, throw
   * @param {object} fields — op-specific fields
   * @param {object} [opts] — optional metadata
   * @param {{line: number, col: number}} [opts.loc] — source location
   * @param {string} [opts.ctype] — resolved C type
   */
  constructor(op, fields, opts = {}) {
    this.op = op;
    Object.assign(this, fields);
    this.loc = opts.loc ?? null;
    this.ctype = opts.ctype ?? null;
  }

  /** @returns {boolean} */
  get isTerminator() {
    return TERMINATORS.has(this.op);
  }

  toString() {
    switch (this.op) {
      case 'alloc':
        return this.value !== undefined
          ? `alloc ${this.dest}, ${this.type}, ${this.value}`
          : `alloc ${this.dest}, ${this.type}`;
      case 'borrow':
        return `borrow ${this.dest}, ${this.source}, ${this.mode}`;
      case 'retain':
        return `retain ${this.operand}`;
      case 'release':
        return `release ${this.operand}`;
      case 'call':
        return this.dest !== null && this.dest !== undefined
          ? `call ${this.dest}, ${this.fn}, [${this.args?.join(', ') ?? ''}]`
          : `call _, ${this.fn}, [${this.args?.join(', ') ?? ''}]`;
      case 'assign':
        return `assign ${this.dest}, ${this.value}`;
      case 'drop':
        return `drop ${this.operand}`;
      case 'return':
        return this.value !== undefined ? `return ${this.value}` : 'return';
      case 'branch':
        return `branch ${this.cond}, ${this.thenLabel}, ${this.elseLabel}`;
      case 'jump':
        return `jump ${this.label}`;
      case 'throw':
        return `throw ${this.error}`;
      case 'phi': {
        const parts = this.incoming.map(i => `${i.value} from ${i.block}`);
        return `phi ${this.dest}, [${parts.join(', ')}]`;
      }
      case 'await':
        return `await ${this.operand}, ${this.resumeLabel}`;
      case 'yield':
        return `yield ${this.value}`;
      default:
        return this.op;
    }
  }

  // ---- Factory methods ----

  /** alloc dest, type, value? */
  static alloc(dest, type, value, opts) {
    const fields = { dest, type };
    if (value !== undefined) fields.value = value;
    return new IRInstruction('alloc', fields, opts);
  }

  /** borrow dest, source, mode('imm'|'mut') */
  static borrow(dest, source, mode, opts) {
    return new IRInstruction('borrow', { dest, source, mode }, opts);
  }

  /** retain operand */
  static retain(operand, opts) {
    return new IRInstruction('retain', { operand }, opts);
  }

  /** release operand */
  static release(operand, opts) {
    return new IRInstruction('release', { operand }, opts);
  }

  /** call dest?, fn, args[] — dest=null for void calls */
  static call(dest, fn, args, opts) {
    return new IRInstruction('call', { dest: dest ?? null, fn, args }, opts);
  }

  /** assign dest, value */
  static assign(dest, value, opts) {
    return new IRInstruction('assign', { dest, value }, opts);
  }

  /** drop operand */
  static drop(operand, opts) {
    return new IRInstruction('drop', { operand }, opts);
  }

  /** return value? — terminator */
  static ret(value, opts) {
    const fields = {};
    if (value !== undefined) fields.value = value;
    return new IRInstruction('return', fields, opts);
  }

  /** branch cond, thenLabel, elseLabel — terminator */
  static branch(cond, thenLabel, elseLabel, opts) {
    return new IRInstruction('branch', { cond, thenLabel, elseLabel }, opts);
  }

  /** jump label — terminator */
  static jump(label, opts) {
    return new IRInstruction('jump', { label }, opts);
  }

  /** throw error — terminator */
  static throwInstr(error, opts) {
    return new IRInstruction('throw', { error }, opts);
  }

  /** phi dest, incoming[{value, block}] */
  static phi(dest, incoming, opts) {
    return new IRInstruction('phi', { dest, incoming }, opts);
  }

  /** await operand, resumeLabel — terminator */
  static awaitInstr(operand, resumeLabel, opts) {
    return new IRInstruction('await', { operand, resumeLabel }, opts);
  }

  /** yield value */
  static yield(value, opts) {
    return new IRInstruction('yield', { value }, opts);
  }
}

/**
 * IRBasicBlock — linear sequence of instructions + exactly one terminator.
 *
 * No branching within a block — only at boundaries (via terminator).
 */
export class IRBasicBlock {
  /**
   * @param {string} label — block label (e.g. 'entry', 'then_block', 'state_0')
   */
  constructor(label) {
    this.label = label;
    /** @type {IRInstruction[]} */
    this.instructions = [];
    /** @type {IRInstruction | null} */
    this.terminator = null;
  }

  /**
   * Add a non-terminator instruction to the end of the block.
   * @param {IRInstruction} instr
   * @throws if instr is a terminator (use setTerminator instead)
   */
  addInstruction(instr) {
    if (instr.isTerminator) {
      throw new Error(`Cannot add terminator "${instr.op}" via addInstruction; use setTerminator`);
    }
    this.instructions.push(instr);
  }

  /**
   * Set the block's terminator. A block can have exactly one terminator.
   * @param {IRInstruction} instr
   * @throws if instr is not a terminator
   * @throws if block already has a terminator
   */
  setTerminator(instr) {
    if (!instr.isTerminator) {
      throw new Error(`"${instr.op}" is not a terminator; use addInstruction`);
    }
    if (this.terminator !== null) {
      throw new Error(`Block "${this.label}" already has a terminator ("${this.terminator.op}")`);
    }
    this.terminator = instr;
  }

  /**
   * Successor block labels, derived from terminator.
   * @returns {string[]}
   */
  get successors() {
    if (!this.terminator) return [];
    switch (this.terminator.op) {
      case 'branch':
        return [this.terminator.thenLabel, this.terminator.elseLabel];
      case 'jump':
        return [this.terminator.label];
      case 'await':
        return [this.terminator.resumeLabel];
      default:
        return [];
    }
  }

  toString() {
    const lines = [`block ${this.label}:`];
    const indent = '    ';
    for (const instr of this.instructions) {
      lines.push(`${indent}${instr}`);
    }
    if (this.terminator) {
      lines.push(`${indent}${this.terminator}`);
    }
    return lines.join('\n');
  }
}

/**
 * IRFunction — function with basic blocks.
 */
export class IRFunction {
  /**
   * @param {string} name — function name
   * @param {string} returnType — C return type (e.g. 'int32_t', 'void')
   * @param {{name: string, ctype: string}[]} params — parameter list
   */
  constructor(name, returnType, params = []) {
    this.name = name;
    this.returnType = returnType;
    this.params = params;
    /** @type {IRBasicBlock[]} */
    this.blocks = [];
    /** @type {IRBasicBlock | null} */
    this.entryBlock = null;
    /** @private SSA name counter */
    this._ssaCounters = new Map();
  }

  /**
   * Add a basic block to this function.
   * First block added becomes the entry block.
   * @param {string} label
   * @returns {IRBasicBlock}
   */
  addBlock(label) {
    const block = new IRBasicBlock(label);
    this.blocks.push(block);
    if (this.entryBlock === null) this.entryBlock = block;
    return block;
  }

  /**
   * Generate a fresh SSA value name.
   * @param {string} hint — base name (e.g. 'x', 'result')
   * @returns {string} — e.g. 'x_0', 'x_1', 'result_0'
   */
  freshName(hint) {
    const count = this._ssaCounters.get(hint) ?? 0;
    this._ssaCounters.set(hint, count + 1);
    return `${hint}_${count}`;
  }

  /**
   * Find a block by label.
   * @param {string} label
   * @returns {IRBasicBlock | undefined}
   */
  getBlockByLabel(label) {
    return this.blocks.find(b => b.label === label);
  }

  toString() {
    const paramStr = this.params.map(p => `${p.ctype} ${p.name}`).join(', ');
    const lines = [`function ${this.name}(${paramStr}): ${this.returnType}`];
    for (const block of this.blocks) {
      lines.push(block.toString());
    }
    return lines.join('\n');
  }
}

/**
 * IRModule — top-level container for compiled module.
 */
export class IRModule {
  /**
   * @param {string} name — module name
   */
  constructor(name) {
    this.name = name;
    /** @type {IRFunction[]} */
    this.functions = [];
  }

  /**
   * Add a function to this module.
   * @param {IRFunction} fn
   */
  addFunction(fn) {
    this.functions.push(fn);
  }

  toString() {
    const lines = [`// module ${this.name}`];
    for (const fn of this.functions) {
      lines.push(fn.toString());
      lines.push('');
    }
    return lines.join('\n');
  }
}
