import { IRModule, IRFunction, IRBasicBlock, IRInstruction } from '../src/compiler/ir/index.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function assertThrows(fn, msg) {
  try { fn(); } catch { passed++; return; }
  failed++; console.error(`  FAIL (expected throw): ${msg}`);
}

function describe(name, fn) {
  const before = failed;
  fn();
  if (failed === before) console.log(`  ✓ ${name}`);
}

// ---------------------------------------------------------------------------
console.log('IR Instruction tests\n');

describe('IRInstruction.factory — alloc', () => {
  const i = IRInstruction.alloc('x_0', 'int32_t', 5);
  assert(i.op === 'alloc', 'op should be alloc');
  assert(i.dest === 'x_0', 'dest should be x_0');
  assert(i.type === 'int32_t', 'type should be int32_t');
  assert(i.value === 5, 'value should be 5');
  assert(!i.isTerminator, 'alloc should not be terminator');
});

describe('IRInstruction.factory — alloc without value', () => {
  const i = IRInstruction.alloc('x_0', 'int32_t');
  assert(i.value === undefined, 'value should be undefined');
});

describe('IRInstruction.factory — borrow', () => {
  const i = IRInstruction.borrow('r_0', 'users', 'imm');
  assert(i.op === 'borrow', 'op should be borrow');
  assert(i.source === 'users', 'source should be users');
  assert(i.mode === 'imm', 'mode should be imm');
  assert(!i.isTerminator, 'borrow should not be terminator');
});

describe('IRInstruction.factory — retain/release', () => {
  const r = IRInstruction.retain('arc_ptr');
  assert(r.op === 'retain' && r.operand === 'arc_ptr', 'retain fields');
  const rel = IRInstruction.release('arc_ptr');
  assert(rel.op === 'release' && rel.operand === 'arc_ptr', 'release fields');
});

describe('IRInstruction.factory — call', () => {
  const i = IRInstruction.call('result_0', 'printf', ['fmt_str', 'x_0']);
  assert(i.op === 'call', 'op should be call');
  assert(i.fn === 'printf', 'fn should be printf');
  assert(i.args.length === 2, 'args length should be 2');
  assert(i.dest === 'result_0', 'dest should be result_0');
  assert(!i.isTerminator, 'call should not be terminator');
});

describe('IRInstruction.factory — call void (no dest)', () => {
  const i = IRInstruction.call(null, 'free', ['ptr_0']);
  assert(i.dest === null, 'dest should be null for void call');
});

describe('IRInstruction.factory — assign', () => {
  const i = IRInstruction.assign('x_0', 'y_0');
  assert(i.op === 'assign' && i.dest === 'x_0' && i.value === 'y_0', 'assign fields');
});

describe('IRInstruction.factory — drop', () => {
  const i = IRInstruction.drop('x_0');
  assert(i.op === 'drop' && i.operand === 'x_0', 'drop fields');
});

describe('IRInstruction.factory — return (terminator)', () => {
  const i = IRInstruction.ret('x_0');
  assert(i.op === 'return' && i.value === 'x_0', 'return fields');
  assert(i.isTerminator, 'return should be terminator');
});

describe('IRInstruction.factory — return void (terminator)', () => {
  const i = IRInstruction.ret();
  assert(i.value === undefined, 'void return value should be undefined');
  assert(i.isTerminator, 'return should be terminator');
});

describe('IRInstruction.factory — branch (terminator)', () => {
  const i = IRInstruction.branch('cond_0', 'then_block', 'else_block');
  assert(i.op === 'branch', 'op should be branch');
  assert(i.cond === 'cond_0', 'cond field');
  assert(i.thenLabel === 'then_block', 'thenLabel field');
  assert(i.elseLabel === 'else_block', 'elseLabel field');
  assert(i.isTerminator, 'branch should be terminator');
});

describe('IRInstruction.factory — jump (terminator)', () => {
  const i = IRInstruction.jump('end_block');
  assert(i.op === 'jump' && i.label === 'end_block', 'jump fields');
  assert(i.isTerminator, 'jump should be terminator');
});

describe('IRInstruction.factory — throw (terminator)', () => {
  const i = IRInstruction.throwInstr('err_0');
  assert(i.op === 'throw' && i.error === 'err_0', 'throw fields');
  assert(i.isTerminator, 'throw should be terminator');
});

describe('IRInstruction.factory — phi', () => {
  const i = IRInstruction.phi('result_0', [
    { value: 'x_0', block: 'then_block' },
    { value: 'y_0', block: 'else_block' },
  ]);
  assert(i.op === 'phi', 'op should be phi');
  assert(i.dest === 'result_0', 'dest field');
  assert(i.incoming.length === 2, 'incoming length should be 2');
  assert(i.incoming[0].value === 'x_0', 'incoming[0].value');
  assert(i.incoming[0].block === 'then_block', 'incoming[0].block');
  assert(!i.isTerminator, 'phi should not be terminator');
});

describe('IRInstruction.factory — await (terminator)', () => {
  const i = IRInstruction.awaitInstr('future_0', 'state_1');
  assert(i.op === 'await', 'op should be await');
  assert(i.operand === 'future_0', 'operand field');
  assert(i.resumeLabel === 'state_1', 'resumeLabel field');
  assert(i.isTerminator, 'await should be terminator');
});

describe('IRInstruction.factory — yield', () => {
  const i = IRInstruction.yield('value_0');
  assert(i.op === 'yield' && i.value === 'value_0', 'yield fields');
  assert(!i.isTerminator, 'yield should not be terminator');
});

describe('IRInstruction — loc and ctype', () => {
  const i = IRInstruction.alloc('x_0', 'int32_t', 5, { loc: { line: 3, col: 5 }, ctype: 'int32_t' });
  assert(i.loc?.line === 3 && i.loc?.col === 5, 'loc should be set');
  assert(i.ctype === 'int32_t', 'ctype should be set');
});

// ---------------------------------------------------------------------------
console.log('\nIRBasicBlock tests\n');

describe('IRBasicBlock — construction', () => {
  const b = new IRBasicBlock('entry');
  assert(b.label === 'entry', 'label should be entry');
  assert(b.instructions.length === 0, 'should start with no instructions');
  assert(b.terminator === null, 'should start with null terminator');
});

describe('IRBasicBlock — addInstruction', () => {
  const b = new IRBasicBlock('entry');
  b.addInstruction(IRInstruction.alloc('x_0', 'int32_t', 5));
  assert(b.instructions.length === 1, 'should have 1 instruction');
});

describe('IRBasicBlock — setTerminator', () => {
  const b = new IRBasicBlock('entry');
  b.setTerminator(IRInstruction.ret('x_0'));
  assert(b.terminator !== null, 'terminator should be set');
  assert(b.terminator.op === 'return', 'terminator op should be return');
});

describe('IRBasicBlock — reject terminator in addInstruction', () => {
  const b = new IRBasicBlock('entry');
  assertThrows(() => {
    b.addInstruction(IRInstruction.ret('x_0'));
  }, 'should reject terminator in addInstruction');
});

describe('IRBasicBlock — reject non-terminator in setTerminator', () => {
  const b = new IRBasicBlock('entry');
  assertThrows(() => {
    b.setTerminator(IRInstruction.alloc('x_0', 'int32_t'));
  }, 'should reject non-terminator in setTerminator');
});

describe('IRBasicBlock — reject double terminator', () => {
  const b = new IRBasicBlock('entry');
  b.setTerminator(IRInstruction.ret());
  assertThrows(() => {
    b.setTerminator(IRInstruction.jump('end'));
  }, 'should reject second terminator');
});

describe('IRBasicBlock — successors from branch', () => {
  const b = new IRBasicBlock('entry');
  b.setTerminator(IRInstruction.branch('cond_0', 'then_block', 'else_block'));
  const succ = b.successors;
  assert(succ.includes('then_block'), 'successors should include then_block');
  assert(succ.includes('else_block'), 'successors should include else_block');
  assert(succ.length === 2, 'should have 2 successors');
});

describe('IRBasicBlock — successors from jump', () => {
  const b = new IRBasicBlock('entry');
  b.setTerminator(IRInstruction.jump('end_block'));
  assert(b.successors.length === 1 && b.successors[0] === 'end_block', 'should have 1 successor');
});

describe('IRBasicBlock — successors from return (none)', () => {
  const b = new IRBasicBlock('entry');
  b.setTerminator(IRInstruction.ret());
  assert(b.successors.length === 0, 'return should have 0 successors');
});

describe('IRBasicBlock — successors from await', () => {
  const b = new IRBasicBlock('entry');
  b.setTerminator(IRInstruction.awaitInstr('fut_0', 'state_1'));
  assert(b.successors.length === 1 && b.successors[0] === 'state_1', 'await successor should be resumeLabel');
});

describe('IRBasicBlock — successors from throw (none)', () => {
  const b = new IRBasicBlock('entry');
  b.setTerminator(IRInstruction.throwInstr('err_0'));
  assert(b.successors.length === 0, 'throw should have 0 successors');
});

// ---------------------------------------------------------------------------
console.log('\nIRFunction tests\n');

describe('IRFunction — construction', () => {
  const f = new IRFunction('add', 'int32_t', [
    { name: 'a', ctype: 'int32_t' },
    { name: 'b', ctype: 'int32_t' },
  ]);
  assert(f.name === 'add', 'name should be add');
  assert(f.returnType === 'int32_t', 'returnType should be int32_t');
  assert(f.params.length === 2, 'should have 2 params');
  assert(f.blocks.length === 0, 'should start with no blocks');
});

describe('IRFunction — addBlock', () => {
  const f = new IRFunction('test', 'void', []);
  const entry = f.addBlock('entry');
  assert(entry instanceof IRBasicBlock, 'addBlock should return IRBasicBlock');
  assert(f.blocks.length === 1, 'should have 1 block');
  assert(f.entryBlock === entry, 'first block should be entry');
});

describe('IRFunction — freshName', () => {
  const f = new IRFunction('test', 'void', []);
  const n1 = f.freshName('x');
  const n2 = f.freshName('x');
  const n3 = f.freshName('y');
  assert(n1 === 'x_0', `first x should be x_0, got ${n1}`);
  assert(n2 === 'x_1', `second x should be x_1, got ${n2}`);
  assert(n3 === 'y_0', `first y should be y_0, got ${n3}`);
});

describe('IRFunction — getBlockByLabel', () => {
  const f = new IRFunction('test', 'void', []);
  f.addBlock('entry');
  f.addBlock('then');
  f.addBlock('else');
  const then = f.getBlockByLabel('then');
  assert(then !== undefined && then.label === 'then', 'should find then block');
  assert(f.getBlockByLabel('nonexistent') === undefined, 'should return undefined for missing label');
});

// ---------------------------------------------------------------------------
console.log('\nIRModule tests\n');

describe('IRModule — construction', () => {
  const m = new IRModule('myapp');
  assert(m.name === 'myapp', 'name should be myapp');
  assert(m.functions.length === 0, 'should start with no functions');
});

describe('IRModule — addFunction', () => {
  const m = new IRModule('myapp');
  const f = new IRFunction('main', 'int32_t', []);
  m.addFunction(f);
  assert(m.functions.length === 1, 'should have 1 function');
  assert(m.functions[0] === f, 'should be same function object');
});

// ---------------------------------------------------------------------------
console.log('\ntoString tests\n');

describe('IRInstruction — toString', () => {
  assert(IRInstruction.alloc('x_0', 'int32_t', 5).toString() === 'alloc x_0, int32_t, 5', 'alloc toString');
  assert(IRInstruction.alloc('x_0', 'int32_t').toString() === 'alloc x_0, int32_t', 'alloc without value toString');
  assert(IRInstruction.ret('x_0').toString() === 'return x_0', 'return toString');
  assert(IRInstruction.ret().toString() === 'return', 'void return toString');
  assert(IRInstruction.jump('end').toString() === 'jump end', 'jump toString');
  assert(IRInstruction.drop('x_0').toString() === 'drop x_0', 'drop toString');
});

describe('IRBasicBlock — toString', () => {
  const b = new IRBasicBlock('entry');
  b.addInstruction(IRInstruction.alloc('x_0', 'int32_t', 5));
  b.addInstruction(IRInstruction.alloc('y_0', 'int32_t', 10));
  b.setTerminator(IRInstruction.branch('cond_0', 'then', 'else'));
  const s = b.toString();
  assert(s.includes('block entry:'), 'should include block header');
  assert(s.includes('alloc x_0'), 'should include first instruction');
  assert(s.includes('alloc y_0'), 'should include second instruction');
  assert(s.includes('branch'), 'should include terminator');
});

describe('IRFunction — toString', () => {
  const f = new IRFunction('add', 'int32_t', [
    { name: 'a', ctype: 'int32_t' },
    { name: 'b', ctype: 'int32_t' },
  ]);
  const entry = f.addBlock('entry');
  entry.addInstruction(IRInstruction.assign('result_0', 'a + b'));
  entry.setTerminator(IRInstruction.ret('result_0'));
  const s = f.toString();
  assert(s.includes('function add'), 'should include function header');
  assert(s.includes('block entry:'), 'should include block header');
});

// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
